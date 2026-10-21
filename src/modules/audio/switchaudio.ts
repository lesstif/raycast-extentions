// Wrapper for SwitchAudioSource (brew install switchaudio-osx).

import { findBinary, run } from "../../lib/exec";

export const SAS = findBinary("SwitchAudioSource");

export type DeviceType = "input" | "output" | "system";

export interface Device {
  name: string;
  type: string;
  id: string;
  uid: string;
}

function sas(args: string[]): Promise<string> {
  return run(SAS as string, args);
}

function parseLines(stdout: string): Device[] {
  // "-f json" prints one JSON object per line.
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Device)
    .map((d) => ({ ...d, id: String(d.id) }));
}

export async function listDevices(type: DeviceType): Promise<Device[]> {
  return parseLines(await sas(["-a", "-t", type, "-f", "json"]));
}

export async function currentDevice(type: DeviceType): Promise<Device | undefined> {
  return parseLines(await sas(["-c", "-t", type, "-f", "json"]))[0];
}

export async function setDevice(type: DeviceType, dev: Device): Promise<void> {
  await sas(["-t", type, "-i", dev.id]);
}
