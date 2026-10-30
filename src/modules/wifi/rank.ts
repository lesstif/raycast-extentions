// Pure logic for the Wi-Fi list. No Raycast imports, so it is easy to test.

/** One access point (BSS) from a scan. SSID and BSSID can be null (redacted). */
export interface BSS {
  ssid: string | null;
  bssid: string | null;
  rssi: number; // dBm. Higher is better (-45 is better than -75).
  noise: number;
  channel: number | null;
  band: string | null; // "2.4" | "5" | "6"
}

export interface CurrentLink extends BSS {
  txRate: number; // Mbit/s
}

export interface WifiInfo {
  interface: string;
  powerOn: boolean;
  locationAuthorized: boolean; // Raycast may read SSIDs (Location Services granted)
  current: CurrentLink | null;
}

export interface NetworkItem {
  ssid: string;
  best: BSS; // Strongest AP of this SSID
  apCount: number; // Number of APs that broadcast this SSID
  historyIndex: number; // Position in the known-networks list (0 = first)
  isCurrent: boolean;
  currentGuessed: boolean; // true when the SSID is redacted and matched by channel + signal
  rssi: number; // Live RSSI for the current network, otherwise the best AP RSSI
  strongerApDb?: number; // Current network only: another AP of the same SSID is this many dB stronger
}

/** A stronger AP of the same SSID must be at least this much better to show a hint. */
export const ROAM_HINT_DB = 8;
/** Largest RSSI difference to treat a scanned AP as the current AP. */
const MATCH_TOLERANCE_DB = 10;

export type Quality = "Excellent" | "Good" | "Fair" | "Weak";

export function quality(rssi: number): Quality {
  if (rssi >= -60) return "Excellent";
  if (rssi >= -67) return "Good";
  if (rssi >= -75) return "Fair";
  return "Weak";
}

/** Parse "a, b, c" into SSIDs. Keeps order and case, removes duplicates. */
export function parseSsidList(text: string | undefined): string[] {
  const list = (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(list)];
}

/** Score how well a scanned AP matches the current link. Lower is better; undefined = no match. */
function matchScore(bss: BSS, cur: CurrentLink): number | undefined {
  if (bss.bssid && cur.bssid) return bss.bssid.toLowerCase() === cur.bssid.toLowerCase() ? 0 : undefined;
  if (bss.channel === null || bss.channel !== cur.channel) return undefined;
  if (bss.band && cur.band && bss.band !== cur.band) return undefined;
  const diff = Math.abs(bss.rssi - cur.rssi);
  return diff <= MATCH_TOLERANCE_DB ? diff : undefined;
}

/** Find the SSID of the current link when macOS redacts it. */
export function guessCurrentSsid(scans: Map<string, BSS[]>, cur: CurrentLink): string | undefined {
  let bestSsid: string | undefined;
  let bestScore = Infinity;
  for (const [ssid, list] of scans) {
    for (const bss of list) {
      const s = matchScore(bss, cur);
      if (s !== undefined && s < bestScore) {
        bestScore = s;
        bestSsid = ssid;
      }
    }
  }
  return bestSsid;
}

/**
 * True for a 5 GHz or 6 GHz network. Uses the scanned band; when the band is unknown,
 * a name like "Home_5G" counts too.
 */
export function isFastBand(ssid: string, bss: BSS): boolean {
  if (bss.band) return bss.band === "5" || bss.band === "6";
  return /(^|[^a-z0-9])5\s*g(hz)?([^a-z0-9]|$)|5g$/i.test(ssid);
}

/**
 * Build the list.
 * - Only known networks (candidates) that the scan found.
 * - 5 GHz / 6 GHz networks first (faster), then 2.4 GHz.
 * - Inside each group: strongest signal first. Equal signal: known-networks order.
 * - The current network is last, so a different network is selected by default.
 */
export function buildNetworks(
  candidates: string[],
  scans: Map<string, BSS[]>,
  info: WifiInfo,
  knownCurrentSsid?: string,
): NetworkItem[] {
  const cur = info.current;
  let currentSsid = knownCurrentSsid ?? cur?.ssid ?? undefined;
  let guessed = false;
  if (!currentSsid && cur) {
    currentSsid = guessCurrentSsid(scans, cur);
    guessed = currentSsid !== undefined;
  }

  const items: NetworkItem[] = [];
  candidates.forEach((ssid, historyIndex) => {
    const list = [...(scans.get(ssid) ?? [])].sort((a, b) => b.rssi - a.rssi);
    if (list.length === 0) return; // Not in range
    const isCurrent = cur !== null && ssid === currentSsid;
    const item: NetworkItem = {
      ssid,
      best: list[0],
      apCount: list.length,
      historyIndex,
      isCurrent,
      currentGuessed: isCurrent && guessed,
      rssi: isCurrent && cur ? cur.rssi : list[0].rssi,
    };
    if (isCurrent && cur) {
      // Remove the AP that we are connected to, then look for a stronger one.
      let skipIndex = -1;
      let skipScore = Infinity;
      list.forEach((b, i) => {
        const s = matchScore(b, cur);
        if (s !== undefined && s < skipScore) {
          skipScore = s;
          skipIndex = i;
        }
      });
      const others = list.filter((_, i) => i !== skipIndex);
      if (others.length > 0 && others[0].rssi - cur.rssi >= ROAM_HINT_DB) {
        item.strongerApDb = others[0].rssi - cur.rssi;
      }
    }
    items.push(item);
  });

  return items.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? 1 : -1;
    const fastA = isFastBand(a.ssid, a.best);
    const fastB = isFastBand(b.ssid, b.best);
    if (fastA !== fastB) return fastA ? -1 : 1;
    if (a.rssi !== b.rssi) return b.rssi - a.rssi;
    return a.historyIndex - b.historyIndex;
  });
}

/** Group a full scan (SSIDs visible) by SSID. Redacted entries are dropped. */
export function groupBySsid(networks: BSS[]): Map<string, BSS[]> {
  const map = new Map<string, BSS[]>();
  for (const n of networks) {
    if (!n.ssid) continue;
    const list = map.get(n.ssid) ?? [];
    list.push(n);
    map.set(n.ssid, list);
  }
  return map;
}
