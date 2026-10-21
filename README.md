# raycast-tools

Personal Raycast tools, migrated from Alfred workflows.
The repository is **one Raycast extension** ("Lesstif Tools"). Each module adds one or more **commands**.
You run setup once on each Mac, no matter how many modules there are.

## Modules

| Module | Command | Description | Needs |
| --- | --- | --- | --- |
| `audio` | Switch Audio Device | Select an attached device and switch output + input together. Devices in use are at the bottom. | `switchaudio-osx` |

Script Commands (bash, no build step) are in [`script-commands/`](script-commands/).

| Script | Description |
| --- | --- |
| `toggle-audio.sh` | Toggle output + input between a USB headset and the built-in devices (fixed keyword, no list) |

## Set up a Mac

Requirements: Homebrew, Node.js 22.22.2 or later.

```
git clone <remote-url> ~/github/raycast-tools
cd ~/github/raycast-tools
./setup.sh
```

`setup.sh` installs the Brewfile packages, runs `npm install`, checks types, and runs `npm run dev`.
When Raycast shows "Lesstif Tools", press Ctrl+C. The extension stays in Raycast.

After `git pull`, run `./setup.sh` again to register new or changed commands.

To use the Script Commands: Raycast Settings → Extensions → **+** → Add Script Directory → select `script-commands/`.

## Structure

```
raycast-tools/
├── package.json            # Extension manifest: one entry in "commands" per command
├── Brewfile                # Homebrew packages that the modules need
├── setup.sh                # Set up one Mac
├── assets/                 # Icons
├── src/
│   ├── <command-name>.tsx  # Command entry point (one line: export the module UI)
│   ├── lib/                # Shared helpers for all modules
│   │   └── exec.ts         # findBinary(), run()
│   └── modules/
│       └── <module>/       # One folder for each module
│           ├── *.ts        # Logic (no Raycast UI imports, easy to test)
│           └── *.tsx       # UI
└── script-commands/        # Raycast Script Commands (bash)
```

## Add a module

1. Make the folder `src/modules/<module>/` and put the logic and UI there.
2. Make the entry file `src/<command-name>.tsx`. Raycast finds a command by this file name.
   ```ts
   export { default } from "./modules/<module>/<Component>";
   ```
3. Add the command to `"commands"` in `package.json`. The `name` must match the entry file name.
   Put command-specific settings in that command's `"preferences"`.
4. If the module needs a Homebrew package, add it to `Brewfile`.
5. Add a row to the Modules table in this file.
6. Run `npm run dev` and test the command.

Rules:
- Modules do not import from other modules. Put shared code in `src/lib/`.
- Use `findBinary()` from `src/lib/exec.ts` for command-line tools. Raycast does not load the shell PATH.
