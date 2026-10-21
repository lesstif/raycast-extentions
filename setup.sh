#!/bin/bash
# Set up this repository on a Mac and register the extension in Raycast.
# Run once on each Mac, and again after you pull new modules.
set -euo pipefail

cd "$(dirname "$0")"

REQUIRED_NODE="22.22.2"

echo "==> Checking Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is not installed. Install it from https://brew.sh and run again." >&2
  exit 1
fi

echo "==> Installing Homebrew packages (Brewfile)"
brew bundle --file=Brewfile

echo "==> Checking Node.js (${REQUIRED_NODE} or later)"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node ${REQUIRED_NODE} or later and run again." >&2
  exit 1
fi
current="$(node -p 'process.versions.node')"
# Compare versions with Node itself (macOS `sort -V` is not on every version).
if ! node -e '
  const req = process.argv[1].split(".").map(Number);
  const cur = process.versions.node.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (cur[i] > req[i]) process.exit(0);
    if (cur[i] < req[i]) process.exit(1);
  }' "$REQUIRED_NODE"; then
  echo "Node.js ${current} is too old. Install ${REQUIRED_NODE} or later and run again." >&2
  exit 1
fi
echo "    Node.js ${current}"

echo "==> Installing npm packages"
npm install

echo "==> Checking types"
npm run typecheck

echo
echo "==> Registering the extension in Raycast"
echo "    When Raycast shows 'Lesstif Tools', press Ctrl+C."
echo "    The extension stays in Raycast after you stop."
echo
npm run dev
