// Run the CoreWLAN helper (native/wifi-helper.swift, built into assets/ by setup.sh).

import { environment } from "@raycast/api";
import { accessSync, chmodSync, constants, existsSync } from "node:fs";
import { join as joinPath } from "node:path";
import { run } from "../../lib/exec";
import { BSS, CurrentLink, WifiInfo } from "./rank";

interface ScanResult {
  query: string | null;
  locationAuthorized: boolean;
  networks: BSS[];
  error: string | null;
}

export interface JoinResult {
  ssid: string;
  joined: boolean;
  verifiedBy: "ssid" | "channel" | null;
  error: string | null;
  current: CurrentLink | null;
}

/** Path of the helper binary, or undefined when setup.sh has not built it. */
export function helperPath(): string | undefined {
  const p = joinPath(environment.assetsPath, "wifi-helper");
  if (!existsSync(p)) return undefined;
  try {
    accessSync(p, constants.X_OK);
  } catch {
    // Raycast can copy assets without the executable bit.
    chmodSync(p, 0o755);
  }
  return p;
}

async function helper<T>(args: string[]): Promise<T> {
  const bin = helperPath();
  if (!bin) throw new Error("wifi-helper not found. Run ./setup.sh");
  return JSON.parse(await run(bin, args)) as T;
}

export function getInfo(): Promise<WifiInfo> {
  return helper<WifiInfo>(["info"]);
}

/** Scan for one SSID (all of its APs), or for all networks when ssid is undefined. */
export async function scan(ssid?: string): Promise<BSS[]> {
  const r = await helper<ScanResult>(ssid === undefined ? ["scan"] : ["scan", ssid]);
  if (r.error) throw new Error(r.error);
  // SSID can be redacted (null). A named scan only returns that SSID, so fill it in.
  return r.networks.map((n) => ({ ...n, ssid: n.ssid ?? ssid ?? null }));
}

/**
 * Join a known network with the password from the keychain, then wait until the
 * interface is on it. `channels` are the channels of its APs from the last scan;
 * they verify the join when macOS hides the SSID. Throws when the join did not happen.
 */
export async function join(ssid: string, channels: number[]): Promise<JoinResult> {
  const r = await helper<JoinResult>(["join", ssid, ...channels.map(String)]);
  if (!r.joined) throw new Error(r.error ?? `Could not join ${ssid}`);
  return r;
}
