#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Toggle Audio (Headset ⇄ Built-in)
# @raycast.mode compact

# Optional parameters:
# @raycast.icon 🎧
# @raycast.packageName Audio
# @raycast.description Switch audio output and input together between USB-C headset and built-in devices.

# ---- Configuration -------------------------------------------------------
# Set a part of each device name. Get the names with:
#   SwitchAudioSource -a -t output
#   SwitchAudioSource -a -t input
HEADSET_KEY="USB"        # Part of the headset name (example: "Jabra", "USB")
BUILTIN_KEY="MacBook"    # Part of the built-in name ("MacBook Air Speakers" / "MacBook Air Microphone")
SET_SYSTEM_SOUND=true    # Also move alert sounds to the new output
# --------------------------------------------------------------------------

# Raycast does not always load the shell PATH. Use the full path as a fallback.
SAS=$(command -v SwitchAudioSource || echo /opt/homebrew/bin/SwitchAudioSource)
if [[ ! -x "$SAS" ]]; then
  echo "SwitchAudioSource not found. Run: brew install switchaudio-osx"
  exit 1
fi

find_dev() {  # $1 = output|input, $2 = name keyword
  "$SAS" -a -t "$1" | grep -i -- "$2" | head -n 1
}

hs_out=$(find_dev output "$HEADSET_KEY")
hs_in=$(find_dev input "$HEADSET_KEY")
bi_out=$(find_dev output "$BUILTIN_KEY")
bi_in=$(find_dev input "$BUILTIN_KEY")
cur_out=$("$SAS" -c -t output)

if [[ -z "$hs_out" ]]; then
  echo "Headset not connected (keyword: $HEADSET_KEY)"
  exit 1
fi

if [[ "$cur_out" == "$hs_out" ]]; then
  new_out=$bi_out; new_in=$bi_in; label="Built-in"
else
  new_out=$hs_out; new_in=$hs_in; label="Headset"
fi

"$SAS" -t output -s "$new_out" >/dev/null || { echo "Output switch failed: $new_out"; exit 1; }
[[ -n "$new_in" ]] && "$SAS" -t input -s "$new_in" >/dev/null
[[ "$SET_SYSTEM_SOUND" == true ]] && "$SAS" -t system -s "$new_out" >/dev/null

echo "$label → 🔊 $new_out · 🎙 ${new_in:-unchanged}"
