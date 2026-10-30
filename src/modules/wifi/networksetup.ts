// Wrappers for the macOS networksetup and ipconfig commands.

import { run } from "../../lib/exec";

const NETWORKSETUP = "/usr/sbin/networksetup";
const IPCONFIG = "/usr/sbin/ipconfig";
const REDACTED = "<redacted>";

/** Parse `networksetup -listpreferredwirelessnetworks` output. Keeps the list order. */
export function parsePreferred(stdout: string): string[] {
  return stdout
    .split("\n")
    .filter((l) => l.startsWith("\t"))
    .map((l) => l.replace(/^\t+/, "").replace(/\r$/, ""))
    .filter((s) => s.length > 0 && s !== REDACTED);
}

/** Networks this Mac has joined before (the "Known Networks" list). */
export async function listPreferred(iface: string): Promise<string[]> {
  return parsePreferred(await run(NETWORKSETUP, ["-listpreferredwirelessnetworks", iface]));
}

/** Parse the SSID from `ipconfig getsummary` output. Undefined when absent or redacted. */
export function parseSummarySsid(stdout: string): string | undefined {
  const m = stdout.match(/^\s*SSID\s*:\s*(.+?)\s*$/m);
  if (!m || m[1] === REDACTED) return undefined;
  return m[1];
}

/**
 * Current SSID. macOS 15+ redacts it in most places. `ipconfig getsummary` shows it
 * after a one-time `sudo ipconfig setverbose 1`. Undefined when no source shows it.
 */
export async function currentSsid(iface: string): Promise<string | undefined> {
  try {
    const ssid = parseSummarySsid(await run(IPCONFIG, ["getsummary", iface]));
    if (ssid) return ssid;
  } catch {
    // Ignore and try the next source.
  }
  try {
    const out = await run(NETWORKSETUP, ["-getairportnetwork", iface]);
    const m = out.match(/Current Wi-Fi Network:\s*(.+?)\s*$/m);
    if (m && m[1] !== REDACTED) return m[1];
  } catch {
    // No source shows the SSID.
  }
  return undefined;
}


export async function setPower(iface: string, on: boolean): Promise<void> {
  await run(NETWORKSETUP, ["-setairportpower", iface, on ? "on" : "off"]);
}
