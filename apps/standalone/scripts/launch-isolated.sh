#!/usr/bin/env bash
# Launch the standalone app with a throw-away $HOME.  The temp dir is wiped
# via `trap … EXIT` the moment the app process exits — including on Ctrl-C,
# crash, or normal close — so no state ever persists across runs.
set -euo pipefail

DIST="$(dirname "$0")/../dist"
APP=$(ls -dt "$DIST"/mac-*/*.app 2>/dev/null | head -n1 || true)
[ -d "${APP:-}" ] || {
    echo "Unpacked .app not found under $DIST."
    echo "Run 'corepack yarn workspace @miragon/bpmn-modeler-standalone package' first."
    exit 1
}

ISO=$(mktemp -d -t miragon-iso)
trap 'rm -rf "$ISO"' EXIT

HOME="$ISO" "$APP/Contents/MacOS/$(basename "$APP" .app)"
