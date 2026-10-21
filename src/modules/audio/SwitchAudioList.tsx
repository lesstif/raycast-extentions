// UI for the "Switch Audio Device" command.

import {
  Action,
  ActionPanel,
  Color,
  getPreferenceValues,
  Icon,
  List,
  openCommandPreferences,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import { Item, loadItems, parseKeywords } from "./items";
import { Device, SAS, setDevice } from "./switchaudio";

interface Preferences {
  hiddenDevices?: string;
}

async function apply(output?: Device, input?: Device): Promise<void> {
  try {
    if (output) {
      await setDevice("output", output);
      // Alert sounds follow the output. Some devices reject this, so ignore errors.
      await setDevice("system", output).catch(() => undefined);
    }
    if (input) await setDevice("input", input);

    const parts = [output && `🔊 ${output.name}`, input && `🎙 ${input.name}`].filter(Boolean);
    await showHUD(parts.join("  ·  "));
  } catch (e) {
    await showToast({ style: Toast.Style.Failure, title: "Switch failed", message: String(e) });
  }
}

function accessories(item: Item): List.Item.Accessory[] {
  // Green tag = that part is in use now. Gray tag = available.
  const list: List.Item.Accessory[] = [];
  if (item.output) {
    list.push({
      tag: { value: "OUT", color: item.outInUse ? Color.Green : Color.SecondaryText },
      tooltip: item.outInUse ? "Current output" : "Output",
    });
  }
  if (item.input) {
    list.push({
      tag: { value: "IN", color: item.inInUse ? Color.Green : Color.SecondaryText },
      tooltip: item.inInUse ? "Current input" : "Input",
    });
  }
  return list;
}

export default function SwitchAudioList() {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const prefs = getPreferenceValues<Preferences>();
      setItems(await loadItems(parseKeywords(prefs.hiddenDevices)));
      setError(undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (SAS) void refresh();
    else setIsLoading(false);
  }, [refresh]);

  if (!SAS) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title="SwitchAudioSource not found"
          description="Run: brew install switchaudio-osx"
        />
      </List>
    );
  }

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter audio devices">
      {error ? (
        <List.EmptyView icon={Icon.Warning} title="Cannot read devices" description={error} />
      ) : (
        <List.EmptyView
          icon={Icon.Headphones}
          title="No audio device"
          description="All devices are hidden or not connected. Check Hidden Devices in preferences (⌘⇧H)."
          actions={
            <ActionPanel>
              <Action title="Open Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
            </ActionPanel>
          }
        />
      )}
      {items.map((item) => (
        <List.Item
          key={item.key}
          icon={item.output ? (item.input ? Icon.Headphones : Icon.SpeakerOn) : Icon.Microphone}
          title={item.title}
          subtitle={item.output && item.input && item.input.name !== item.output.name ? `+ ${item.input.name}` : undefined}
          accessories={accessories(item)}
          actions={
            <ActionPanel>
              <Action
                title={item.output && item.input ? "Use for Output + Input" : item.output ? "Use for Output" : "Use for Input"}
                icon={Icon.CheckCircle}
                onAction={() => apply(item.output, item.input)}
              />
              {item.output && item.input ? (
                <>
                  <Action
                    title="Output Only"
                    icon={Icon.SpeakerOn}
                    shortcut={{ modifiers: ["cmd"], key: "o" }}
                    onAction={() => apply(item.output, undefined)}
                  />
                  <Action
                    title="Input Only"
                    icon={Icon.Microphone}
                    shortcut={{ modifiers: ["cmd"], key: "i" }}
                    onAction={() => apply(undefined, item.input)}
                  />
                </>
              ) : null}
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={refresh}
              />
              <Action
                title="Hide Devices…"
                icon={Icon.EyeDisabled}
                shortcut={{ modifiers: ["cmd", "shift"], key: "h" }}
                onAction={openCommandPreferences}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
