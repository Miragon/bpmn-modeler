# `@miragon/bpmn-modeler-cli` — runtime-distribution prototype (#1061)

A throwaway prototype that proves the BPMN/DMN modeler can launch on a machine
with **no Node installed**, by compiling a tiny host server to a single
self-contained binary with [Bun](https://bun.sh) (`bun build --compile`).

This is the publish-blocker spike for the JetBrains Marketplace track
(#1061, parent epic #920). It is **not** a shipping product — the IntelliJ
plugin packaging that consumes this binary is #1062. The rationale and the
measured comparison of distribution options live in the ADR:
`docs/vscode/contributing/architecture/runtime-distribution.md`.

## What it does

`bpmn-modeler <file.bpmn|file.dmn>` boots a local HTTP + WebSocket server that:

- serves the **unmodified production** `bpmn-webview` / `dmn-webview` bundle as
  static assets,
- bridges the webview's `Query`/`Command` protocol to the file over a
  WebSocket (`/bridge`) — the same `getVsCodeApi()` selector that picks the VS
  Code API in the extension picks `WebSocketChannelImpl` here, driven by the
  injected `window.__WS_BRIDGE__` global,
- reads the file on load and writes it back on `SyncDocumentCommand`.

No modeling logic is reimplemented: execution-platform detection reuses
`BpmnDocument` from `@miragon/bpmn-modeler-core`.

## Build

```bash
# from the repo root — libs + webviews must be built first
corepack yarn build:libs
corepack yarn build:bpmn-webview
corepack yarn build:dmn-webview

# typecheck → bun compile → copy webview assets next to the binary
corepack yarn workspace @miragon/bpmn-modeler-cli build
```

Output: `apps/modeler-cli/dist/bpmn-modeler` (the binary) plus
`apps/modeler-cli/dist/webviews/{bpmn,dmn}-webview/` (the assets the binary
serves; resolved relative to the executable at runtime).

## Run / prove it needs no Node

```bash
cd apps/modeler-cli/dist
# a PATH with neither node nor bun on it
env -i HOME="$HOME" PATH=/usr/bin:/bin ./bpmn-modeler /path/to/diagram.bpmn
```

## Cross-platform

`bun build --compile` cross-compiles via `--target`; this prototype targets the
host (`bun-darwin-arm64`). The release matrix
(`bun-{darwin-arm64,darwin-x64,linux-x64,windows-x64}`) is documented in the
ADR but not produced here.

## Known cosmetic gap

The webview build's vite static-copy glob places the bpmn/dmn icon fonts under
`font/…` while the icon-font CSS references them via `url(../font/…)` → `css/…`.
The server rewrites those requests so icons load here; the proper fix belongs
in the webview build's copy globs.
