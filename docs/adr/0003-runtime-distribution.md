# 0003 — Ship the modeler runtime as a self-contained Bun binary

- Status: accepted (#1061)
- Date: 2026-06-08
- Category: modeler-bridge

Parent: epic #920 (IntelliJ host parity). Unblocks the JetBrains Marketplace
publish gate. The transport-hardening work in the host foundation
([ADR 0004](0004-intellij-host-foundation.md), #1062) depends on this decision;
the IntelliJ plugin packaging that ships the artifact is also #1062.

## Context

The #920 spikes proved the modeler can run as a third host (after VS Code and
Theia) by hosting the `vscode`-free engine out-of-process and driving a webview
over a message bridge. But they all **spawn `node` from `PATH`** — a dev-only
assumption. A JetBrains plugin cannot require its users to have a matching Node
installed, so this is the single remaining blocker to *publishing*, independent
of feature completeness. The decision also fixes the transport shape:
subprocess-over-RPC and in-process GraalJS interop are different host-adapter
designs, so it must land before bridge-transport productionization.

The pure `libs/modeler-core` (#1060) is identical regardless of how it is
shipped, so the engine itself is unaffected by this choice.

## Decision

**Ship the JavaScript runtime as a single self-contained binary compiled with
Bun (`bun build --compile`)** — option (b) below.

The deps that matter (`bpmn-moddle`, `bpmn-js-differ`, and the webview bundles)
are pure JS, so the Node-compatibility risk that rules out Bun for some projects
does not bite here. Bun cross-compiles to every target platform from one
toolchain (`--target=bun-{darwin-arm64,darwin-x64,linux-x64,windows-x64}`),
which keeps the platform matrix to a build-flag rather than a per-platform
download-and-stage pipeline.

### Prototype

The throwaway proof was `apps/modeler-cli/` (since removed): a `commander` CLI
that booted an `express` + `ws` server, served the **unmodified production**
webview bundle, and bridged its `Query`/`Command` protocol to the file over a
WebSocket. The *same* `getVsCodeApi()` selector that returns the VS Code API in
the extension returned a `WebSocketChannelImpl` when the served HTML injected
`window.__WS_BRIDGE__` — so no webview code forked for this host.
Execution-platform detection reused `BpmnDocument` from `modeler-core` rather
than duplicating it. The prototype validated the approach; the production
IntelliJ host then relays webview messages over the stdio bridge instead, so the
CLI and its WebSocket seam were dropped.

### Measurements (macOS arm64, Bun 1.3.10)

Measured on the prototype with a clean PATH containing neither `node` nor `bun`
(`env -i HOME="$HOME" PATH=/usr/bin:/bin ./bpmn-modeler diagram.bpmn`):

| Metric | Value |
|---|---|
| Binary (Bun runtime + bundled server JS) | **60 MB** |
| Webview assets shipped alongside | **7.5 MB** |
| Total shipped artifact | **≈ 68 MB** |
| Cold start (process spawn → server-ready) | **10–15 ms** (median ~12 ms) |
| Build: bundle 277 modules → compile | ~70 ms + ~130–260 ms |

Both BPMN (diagram renders: 4 shapes, 2 connections) and DMN (DRD container
renders) load and round-trip edits to disk over the bridge, with no `node`/`bun`
on `PATH`. *Cold start measures server-ready, not first paint; webview render is
a separate, browser-bound cost.*

## Options evaluated

| Option | Artifact size | Cold start | Platform matrix | Maintenance |
|---|---|---|---|---|
| **(a) Bundle a per-platform Node binary** | Node ≈60–110 MB **per platform** + app JS + assets | Node process startup (tens of ms) | Download & stage one Node per target | Track Node releases/CVEs; largest payload × N |
| **(b) Single binary — Bun `--compile` (chosen)** | **68 MB total (measured)** | **~12 ms (measured)** | One toolchain, `--target` per platform | One runtime to track; smallest ergonomic path |
| (b) Single binary — Node **SEA** | ≈85–110 MB (full `node` + injected blob) | Node startup | Build + `postject` + **macOS codesign** per target | Official but experimental; multi-step, signing friction |
| (b) Single binary — **`pkg`** | n/a | n/a | n/a | **Rejected:** Vercel archived `pkg` in favour of SEA |
| (b) Single binary — **Deno compile** | ≈80 MB | Deno startup | `--target` per platform | Viable; not installed in this repo, slightly more npm-compat friction |
| **(c) GraalVM / GraalJS in-process** | No separate binary; +≈30–50 MB polyglot jars in the plugin | JVM-warm, no subprocess | JVM-portable (no per-OS binary) | **Highest JS-compat risk** (`bpmn-moddle` sax parsing, CJS interop); heaviest integration |

## Consequences

- The plugin can launch the modeler on a machine with no Node — the publish
  gate is cleared (prototype-proven on macOS arm64).
- One new shared seam: `WebSocketChannelImpl` + the `window.__WS_BRIDGE__`
  selector. Production VS Code is unaffected (the global is absent, so the
  existing `acquireVsCodeApi()` path is taken); confirmed by a green Vitest
  suite (532 tests) and a successful plugin build.
- The transport for #1062 is fixed as **subprocess-over-bridge**, not in-process
  interop; in-process VS Code stays a direct call with zero IPC.
- The cross-compile matrix is a release-pipeline `--target` loop, deferred to
  #1062 along with code-signing/notarization for distribution.

## Alternatives rejected

- **`pkg`** — archived upstream; no path forward for new work.
- **Node SEA as the primary path** — official, but the build is multi-step
  (blob + `postject`) and needs macOS codesigning just to launch; larger
  artifact for no functional gain over Bun here. Kept as the fallback if a hard
  Node-only dependency ever surfaces.
- **GraalVM/GraalJS in-process (c)** — most elegant distribution story (no
  binary, no subprocess) but the JS-compat risk against `bpmn-moddle`/sax and
  CommonJS interop is real and unproven, and it would re-shape the host-adapter
  transport. Parked as a documented future avenue, not v1.
- **Bundle per-platform Node (a)** — simplest and maximally compatible, but the
  largest payload, multiplied across the platform matrix, with ongoing Node
  release/CVE tracking. Bun gives the same "real runtime" guarantee at a smaller,
  single-toolchain cost.

## Follow-ups

- Embedding the webview assets *inside* the binary (vs. shipping alongside) —
  optional size/packaging optimization.
- The webview build's vite static-copy globs nest the icon fonts under `font/…`
  while the font CSS references `url(../font/…)`; the prototype server rewrites
  those requests, but the proper fix belongs in the webview build.
