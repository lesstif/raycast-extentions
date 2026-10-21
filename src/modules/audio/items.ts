// Build the device list: pair outputs with inputs, hide devices, sort.

import { currentDevice, Device, listDevices } from "./switchaudio";

export interface Item {
  key: string;
  title: string;
  output?: Device; // Set for an output device (and its paired input, if any)
  input?: Device; // Paired input, or the device itself for an input-only item
  outInUse: boolean; // This item's output is the current output
  inInUse: boolean; // This item's input is the current input
}

// Sort rank. A lower rank is higher in the list.
//   usage:  0 = not in use, 1 = output or input in use, 2 = both in use
//   single: 0 = has output + input, 1 = output-only or input-only
// Result order: paired (free) → single (free) → in use (partly) → in use (both).
export function rank(i: Item): number {
  const usage = Number(i.outInUse) + Number(i.inInUse);
  const single = i.output && i.input ? 0 : 1;
  return usage * 2 + single;
}

/** Find the input that belongs to an output. */
export function pairInput(out: Device, inputs: Device[]): Device | undefined {
  // 1. Same name (most USB/Bluetooth headsets, AirPods, display audio).
  const same = inputs.find((i) => i.name === out.name);
  if (same) return same;

  // 2. Built-in: "MacBook Air Speakers" -> "MacBook Air Microphone".
  if (out.uid === "BuiltInSpeakerDevice") {
    const mic = inputs.find((i) => i.uid === "BuiltInMicrophoneDevice");
    if (mic) return mic;
  }
  const base = out.name.replace(/\s*Speakers?$/i, "");
  if (base !== out.name) {
    return inputs.find((i) => i.name.startsWith(base) && /microphone/i.test(i.name));
  }
  return undefined;
}

/** Parse "a, b, c" into lowercase keywords. */
export function parseKeywords(text: string | undefined): string[] {
  return (text ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isHidden(dev: Device, keywords: string[]): boolean {
  const name = dev.name.toLowerCase();
  return keywords.some((k) => name.includes(k));
}

/** Pure function: easy to test without SwitchAudioSource. */
export function buildItems(
  outputs: Device[],
  inputs: Device[],
  curOut: Device | undefined,
  curIn: Device | undefined,
  hidden: string[],
): Item[] {
  const visibleOutputs = outputs.filter((d) => !isHidden(d, hidden));
  const visibleInputs = inputs.filter((d) => !isHidden(d, hidden));
  const pairedInputIds = new Set<string>();
  const items: Item[] = [];

  for (const out of visibleOutputs) {
    const inp = pairInput(out, visibleInputs);
    if (inp) pairedInputIds.add(inp.id);
    items.push({
      key: `out-${out.id}`,
      title: out.name,
      output: out,
      input: inp,
      outInUse: out.id === curOut?.id,
      inInUse: inp !== undefined && inp.id === curIn?.id,
    });
  }

  // Input-only devices (example: USB microphone).
  for (const inp of visibleInputs) {
    if (pairedInputIds.has(inp.id)) continue;
    items.push({
      key: `in-${inp.id}`,
      title: inp.name,
      input: inp,
      outInUse: false,
      inInUse: inp.id === curIn?.id,
    });
  }

  // The first item is selected by default, so a paired device that is not in use
  // is ready to pick. Array.sort is stable, so the original order stays within each rank.
  return items.sort((a, b) => rank(a) - rank(b));
}

export async function loadItems(hidden: string[]): Promise<Item[]> {
  const [outputs, inputs, curOut, curIn] = await Promise.all([
    listDevices("output"),
    listDevices("input"),
    currentDevice("output"),
    currentDevice("input"),
  ]);
  return buildItems(outputs, inputs, curOut, curIn, hidden);
}
