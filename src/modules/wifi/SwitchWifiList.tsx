// UI for the "Switch Wi-Fi" command.

import {
  Action,
  ActionPanel,
  Cache,
  Color,
  getPreferenceValues,
  Icon,
  List,
  open,
  openCommandPreferences,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getInfo, helperPath, join, scan } from "./helper";
import { currentSsid, listPreferred, setPower } from "./networksetup";
import { BSS, buildNetworks, groupBySsid, NetworkItem, parseSsidList, quality, WifiInfo } from "./rank";

interface Preferences {
  networks?: string;
  maxNetworks?: string;
}

const WIFI_SETTINGS_URL = "x-apple.systempreferences:com.apple.wifi-settings-extension";
const LOCATION_SETTINGS_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Last result cache ----------------------------------------------------
// A scan of each known network takes several seconds. Show the last result at
// once, marked "cached", and replace each network as its fresh scan arrives.

const cache = new Cache();
const CACHE_KEY = "wifi.lastScan.v1";

interface LastScan {
  at: number;
  info: WifiInfo;
  candidates: string[];
  scans: [string, BSS[]][];
  currentSsid?: string;
}

function readLast(): LastScan | undefined {
  try {
    const raw = cache.get(CACHE_KEY);
    return raw ? (JSON.parse(raw) as LastScan) : undefined;
  } catch {
    return undefined;
  }
}

function writeLast(v: LastScan): void {
  cache.set(CACHE_KEY, JSON.stringify(v));
}

// ---- Rendering --------------------------------------------------------------

const QUALITY_COLOR = {
  Excellent: Color.Green,
  Good: Color.Blue,
  Fair: Color.Orange,
  Weak: Color.Red,
} as const;

function accessories(item: NetworkItem, fresh: boolean): List.Item.Accessory[] {
  const list: List.Item.Accessory[] = [];
  if (!fresh) list.push({ tag: { value: "cached", color: Color.SecondaryText }, tooltip: "From the last scan" });
  const b = item.best;
  if (b.band || b.channel !== null) {
    list.push({
      text: [b.band && `${b.band} GHz`, b.channel !== null && `ch ${b.channel}`].filter(Boolean).join(" · "),
      tooltip: item.apCount > 1 ? "Strongest AP of this network" : undefined,
    });
  }
  const q = quality(item.rssi);
  list.push({ tag: { value: `${item.rssi} dBm`, color: QUALITY_COLOR[q] }, tooltip: q });
  if (item.isCurrent) {
    list.push({
      tag: { value: item.currentGuessed ? "Connected?" : "Connected", color: Color.Green },
      tooltip: item.currentGuessed
        ? "macOS hides the SSID. Matched by channel and signal. Allow Location for Raycast to show the real SSID."
        : "Current network",
    });
  }
  return list;
}

function subtitle(item: NetworkItem): string | undefined {
  const parts: string[] = [];
  if (item.apCount > 1) parts.push(`${item.apCount} APs`);
  if (item.strongerApDb !== undefined) parts.push(`Stronger AP +${item.strongerApDb} dB → Reconnect`);
  return parts.length > 0 ? parts.join("  ·  ") : undefined;
}

function channelsOf(item: NetworkItem, scans: Map<string, BSS[]>): number[] {
  return (scans.get(item.ssid) ?? [])
    .map((b) => b.channel)
    .filter((c): c is number => c !== null);
}

export default function SwitchWifiList() {
  const last = useRef(readLast()).current;
  const [info, setInfo] = useState<WifiInfo | undefined>(last?.info);
  const [candidates, setCandidates] = useState<string[]>(last?.candidates ?? []);
  const [scans, setScans] = useState<Map<string, BSS[]>>(new Map(last?.scans ?? []));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [knownCurrent, setKnownCurrent] = useState<string | undefined>(last?.currentSsid);
  const [progress, setProgress] = useState<{ done: number; total: number }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const runId = useRef(0);
  const hasHelper = helperPath() !== undefined;

  const refresh = useCallback(async () => {
    const id = ++runId.current;
    const stale = () => id !== runId.current;
    setIsLoading(true);
    setError(undefined);
    setFresh(new Set());
    try {
      const prefs = getPreferenceValues<Preferences>();
      const wifi = await getInfo();
      if (stale()) return;
      setInfo(wifi);
      if (!wifi.powerOn) return;

      const cur = wifi.current?.ssid ?? (wifi.current ? await currentSsid(wifi.interface) : undefined);
      if (stale()) return;
      setKnownCurrent(cur);

      // Candidates: the networks set in preferences, or the known-networks list.
      let list = parseSsidList(prefs.networks);
      if (list.length === 0) {
        const max = Math.max(1, parseInt(prefs.maxNetworks ?? "4", 10) || 4);
        list = (await listPreferred(wifi.interface)).slice(0, max);
      }
      if (cur && !list.includes(cur)) list = [...list, cur];
      if (stale()) return;
      setCandidates(list);

      let result: Map<string, BSS[]>;
      if (wifi.locationAuthorized) {
        // SSIDs are visible: one full scan is enough.
        setProgress({ done: 0, total: 1 });
        const all = groupBySsid(await scan());
        if (stale()) return;
        result = new Map([...all].filter(([ssid]) => list.includes(ssid)));
        setScans(result);
        setFresh(new Set(list));
      } else {
        // SSIDs are hidden: scan each known SSID by name. Show results as they come.
        result = new Map();
        let failed = 0;
        for (let i = 0; i < list.length; i++) {
          setProgress({ done: i, total: list.length });
          try {
            const found = await scan(list[i]);
            if (stale()) return;
            result.set(list[i], found);
            setScans((prev) => new Map(prev).set(list[i], found));
            setFresh((prev) => new Set(prev).add(list[i]));
          } catch {
            failed++;
          }
        }
        if (stale()) return;
        // Drop cached networks that were not scanned this time.
        setScans(new Map(result));
        if (failed === list.length && list.length > 0) setError("All scans failed. Try again in a few seconds.");
      }
      writeLast({ at: Date.now(), info: wifi, candidates: list, scans: [...result], currentSsid: cur });
    } catch (e) {
      if (!stale()) setError(String(e));
    } finally {
      if (!stale()) {
        setProgress(undefined);
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (hasHelper) void refresh();
    else setIsLoading(false);
  }, [refresh, hasHelper]);

  const items = useMemo(
    () => (info ? buildNetworks(candidates, scans, info, knownCurrent) : []),
    [candidates, scans, info, knownCurrent],
  );

  async function connect(item: NetworkItem) {
    const toast = await showToast({ style: Toast.Style.Animated, title: `Connecting to ${item.ssid}…` });
    try {
      const r = await join(item.ssid, channelsOf(item, scans));
      toast.hide();
      const ch = r.current?.channel;
      await showHUD(`📶 ${item.ssid}${ch ? `  ·  ch ${ch}` : ""}`);
      void refresh();
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = `Cannot connect to ${item.ssid}`;
      toast.message = `${String(e).replace(/^Error:\s*/, "")}. The router may have refused, or the saved password is wrong.`;
      void refresh();
    }
  }

  // Turn Wi-Fi off and on, then join the SSID. macOS then picks the strongest AP.
  // Use this when two APs broadcast the same SSID and the Mac stays on the far one.
  async function reconnect(item: NetworkItem) {
    if (!info) return;
    const toast = await showToast({ style: Toast.Style.Animated, title: `Reconnecting to ${item.ssid}…` });
    try {
      await setPower(info.interface, false);
      await sleep(1000);
      await setPower(info.interface, true);
      await sleep(2000);
      const r = await join(item.ssid, channelsOf(item, scans));
      toast.hide();
      const ch = r.current?.channel;
      await showHUD(`📶 ${item.ssid} (reconnected)${ch ? `  ·  ch ${ch}` : ""}`);
      void refresh();
    } catch (e) {
      toast.style = Toast.Style.Failure;
      toast.title = `Cannot reconnect to ${item.ssid}`;
      toast.message = String(e).replace(/^Error:\s*/, "");
      void refresh();
    }
  }

  async function turnOn() {
    if (!info) return;
    await setPower(info.interface, true);
    await sleep(2000);
    void refresh();
  }

  if (!hasHelper) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="wifi-helper not built"
          description="Run ./setup.sh in the raycast-tools folder. It needs Xcode Command Line Tools (xcode-select --install)."
        />
      </List>
    );
  }

  const title = progress ? `Scanning ${Math.min(progress.done + 1, progress.total)}/${progress.total}…` : undefined;
  const showLocationHint = info !== undefined && info.powerOn && !info.locationAuthorized;

  return (
    <List isLoading={isLoading} navigationTitle={title} searchBarPlaceholder="Filter known networks">
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Cannot scan Wi-Fi" description={error} />
      ) : info && !info.powerOn ? (
        <List.EmptyView
          icon={Icon.WifiDisabled}
          title="Wi-Fi is off"
          actions={
            <ActionPanel>
              <Action title="Turn Wi-Fi On" icon={Icon.Wifi} onAction={turnOn} />
            </ActionPanel>
          }
        />
      ) : (
        <List.EmptyView
          icon={Icon.Wifi}
          title={isLoading ? "Scanning…" : "No known network in range"}
          description={
            isLoading
              ? undefined
              : candidates.length === 0
                ? "No known networks found. Set Networks in preferences (⌘⇧P)."
                : `Scanned: ${candidates.join(", ")}`
          }
          actions={
            <ActionPanel>
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={refresh} />
              <Action title="Open Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
            </ActionPanel>
          }
        />
      )}
      <List.Section title="Known networks in range">
        {items.map((item) => (
          <List.Item
            key={item.ssid}
            icon={{ source: Icon.Wifi, tintColor: QUALITY_COLOR[quality(item.rssi)] }}
            title={item.ssid}
            subtitle={subtitle(item)}
            accessories={accessories(item, fresh.has(item.ssid))}
            actions={
              <ActionPanel>
                {item.isCurrent ? (
                  <Action
                    title="Reconnect (Strongest AP)"
                    icon={Icon.ArrowClockwise}
                    onAction={() => reconnect(item)}
                  />
                ) : (
                  <Action title="Connect" icon={Icon.Wifi} onAction={() => connect(item)} />
                )}
                {!item.isCurrent ? (
                  <Action
                    title="Reconnect (Strongest AP)"
                    icon={Icon.ArrowClockwise}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                    onAction={() => reconnect(item)}
                  />
                ) : null}
                <Action
                  title="Refresh"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={refresh}
                />
                <Action.CopyToClipboard
                  title="Copy SSID"
                  content={item.ssid}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                />
                <Action
                  title="Open Wi-Fi Settings"
                  icon={Icon.Gear}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
                  onAction={() => open(WIFI_SETTINGS_URL)}
                />
                <Action
                  title="Preferences…"
                  icon={Icon.Gear}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                  onAction={openCommandPreferences}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
      {showLocationHint ? (
        <List.Section title="Tip">
          <List.Item
            icon={Icon.Pin}
            title="Allow Location for Raycast to scan all networks at once"
            subtitle="System Settings → Privacy & Security → Location Services → Raycast"
            accessories={[{ text: `${candidates.length} scans now` }]}
            actions={
              <ActionPanel>
                <Action title="Open Location Services Settings" icon={Icon.Gear} onAction={() => open(LOCATION_SETTINGS_URL)} />
                <Action title="Refresh" icon={Icon.ArrowClockwise} shortcut={{ modifiers: ["cmd"], key: "r" }} onAction={refresh} />
              </ActionPanel>
            }
          />
        </List.Section>
      ) : null}
    </List>
  );
}
