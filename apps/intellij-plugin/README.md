# Miragon BPMN Modeler — IntelliJ plugin

A third host for the Miragon BPMN modeler (after VS Code and Theia). It opens
`.bpmn` files in a **JCEF** (embedded Chromium) editor, renders them with the
**existing** bpmn-js webview bundle, and round-trips edits back to disk — while
running the **unmodified TypeScript core out-of-process**, as a supervised,
**Node-free** binary.

This is the host foundation from issue #1062. It is **pure transport + port
adapters**: the modeling engine is `@miragon/bpmn-modeler-core`, consumed over a
bridge (`apps/modeler-bridge/`), never reimplemented in Kotlin.

## Architecture

```
.bpmn ─▶ BpmnFileEditorProvider ─▶ BpmnFileEditor (JCEF browser)
                                      │   ▲
  loads http://127.0.0.1:<port>/...  │   │ window.postMessage (Query/Command)
                                      ▼   │
                             WebviewServer (serves the pre-built bundle)
                                      │
  bpmn-js webview (Chromium) ─postMessage▶ JBCefJSQuery ─┐
                                                         │
                       ┌─────────── CoreProcess (Kotlin) ┘   supervisor +
        webview/message│ editor/      │     │ document/write,    port adapters
        session/*      │ postMessage  │     │ document/save,
        statusBar/*    │ notifier/*   ▼     ▼
        ┌────── modeler-bridge (Bun binary, REUSED TS core) ──────┐
        │  EditorSessionStore + BpmnModelerService + Router       │
        └──────────────────────────────────────────────────────────┘
```

### Two key decisions (see the ADR)

`docs/vscode/contributing/architecture/intellij-host-foundation.md` records:

- **Transport — one stdio JSON-RPC pipe.** Core↔host *and* the webview-message
  relay ride a single supervised NDJSON pipe (not a webview↔server WebSocket
  seam). Single transport ⇒ simplest crash detection/recovery, smallest attack
  surface, leanest binary (no embedded HTTP/WS server, no open port).
- **Topology — one core per project.** `CoreProcess` is a project-level service,
  lazily spawned on the first `.bpmn` open and torn down with the project. A
  crash is isolated to one project window; closing the project leaves no orphan.

### Process supervisor (`CoreProcess`)

- **Spawns the bundled Bun binary** (`/bin/<os>-<arch>/modeler-bridge`, extracted
  from the plugin classpath), not `node` from `PATH`. Dev override:
  `-Dmiragon.bridge=/abs/path` or `MIRAGON_BRIDGE`.
- **Crash recovery:** detects process exit, respawns with linear backoff (giving
  up after repeated rapid crashes), re-registers every live session from the
  authoritative IntelliJ `Document`, and replays `GetBpmnFileCommand` so open
  editors re-render.
- **No orphans:** the bridge exits on stdin EOF, so a dying JVM never orphans it;
  `dispose()` + a shutdown hook + `destroyForcibly` are belt-and-suspenders.
- **Backpressure:** a single writer thread drains a bounded outbound queue that
  coalesces superseded document-sync frames per editor, so the EDT/JS threads
  never block on bridge stdin.

### Display ports

- **Notifier → `Notifications.Bus`** balloons (+ IDE log) via `HostNotifications`.
- **StatusBar → `EngineStatusBarWidget`**: engine version + element-template count.

## Build & run

This Gradle build does **not** invoke the JS/Bun toolchain — it only packages
the already-built artefacts (webview bundles + the `modeler-bridge` binary).

**One command (from the repo root)** builds those artefacts and launches the
sandbox IDE:

```bash
corepack yarn intellij:run
```

`intellij:run` = `intellij:build` (libs → bpmn + deployment webviews → bridge
`compile`) then `./gradlew runIde`. Use `corepack yarn intellij:build` alone to
refresh the artefacts without launching, then re-run `runIde` yourself.

<details>
<summary>The manual equivalent</summary>

```bash
corepack yarn build:libs
corepack yarn build:bpmn-webview          # → dist/webview-staging/bpmn-webview/
corepack yarn build:deployment-webview    # → dist/webview-staging/deployment-webview/
corepack yarn workspace @miragon/bpmn-modeler-bridge compile
                                          # → apps/modeler-bridge/dist/modeler-bridge
cd apps/intellij-plugin && ./gradlew runIde
```

</details>

A sandboxed IntelliJ IDEA Community launches. Open any `.bpmn` file — it opens in
a **BPMN Modeler** tab and the diagram renders. Move/add an element, then
`Ctrl/Cmd+S`, and switch to the plain-text tab to confirm the round-tripped XML.
The status bar shows the engine version + template count; loading errors surface
as balloons. Tail the IDE log for `[bridge stderr]` lines to watch the seam.

> The Gradle build only repackages the artefacts `intellij:build` produced — a
> webview/CSS change is **not** picked up until you rebuild them. Re-run
> `corepack yarn intellij:build` (or the full `intellij:run`) after editing the
> webview.

### Verifying the dark-mode Token Simulation fix (#1199)

Token Simulation used to break the diagram in dark mode (white shapes, vanished
arrows). To verify it stays fixed: switch the sandbox IDE to a **dark** theme
(`Settings → Appearance` → a Dark theme), open a diagram with sequence flows
(e.g. `c7-subscribe-newsletter.bpmn`), click **Token Simulation**, and confirm
transparent backgrounds stay transparent and every flow/arrow remains visible.

The bug lives in the shared `bpmn-webview` dark stylesheet, so the fastest loop
is **not** IntelliJ — reproduce in the browser preview instead:
`corepack yarn workspace @miragon/bpmn-modeler-webview serve`, then open
`http://localhost:5173/?theme=dark` (the `?theme=dark` switch is dev-only) and
toggle Token Simulation.

### Crash-recovery / orphan check

Kill the `modeler-bridge` process (Activity Monitor / `kill`). The open editor
recovers (the session re-registers and the diagram re-renders) and no orphaned
process remains. Closing the IDE leaves no `modeler-bridge` process behind.

## Troubleshooting

### The diagram canvas feels "one interaction behind" (Windows)

**Symptoms.** After you click on the canvas the context pad lingers; a deleted
element stays visible until your next selection; drags feel like they repaint a
frame late. It looks like the modeler is always one input event behind.

**Cause.** On IntelliJ 2025+/2026 builds JCEF (the embedded Chromium) runs
**out-of-process** ("remote" CEF). The plugin's browsers render **off-screen**
(OSR) — the only mode available under remote CEF — and that remote-OSR frame
pipeline presents a frame only on the *next* input event when the DOM mutates on
a click. The lag is entirely in Chromium's frame delivery; it never touches the
modeler core or the bridge.

**Fix.** Turn off out-of-process JCEF so it runs in-process:

- **Help → Find Action → "Registry…"**, disable
  `ide.browser.jcef.out-of-process.enabled`, then restart the IDE. On an affected
  setup the plugin shows this same hint once as a balloon (with a "Don't show
  again" opt-out); applying the registry change makes the balloon self-cancel,
  since the plugin then detects in-process JCEF.

> **The `-Djcef.remote.enabled=false` VM option is not enough.** Platform sources
> suggest a pre-set property disables remote mode, but on 2026.1 (IU-261.25134.95,
> JBR 25.0.3, JCEF 137) it verifiably does nothing: with only the VM option set the
> staleness persists, and browsers still resolve as remote-OSR. Use the registry
> key above — it is the platform's master switch.

> **Leave `ide.browser.jcef.osr.enabled` alone.** While out-of-process JCEF is
> active, setting it to `false` does not give you windowed rendering — it makes
> **every** `JBCefBrowser` construction throw, so the modeler, diff viewer, and
> deployment tool window all fail to start (the editor then shows a "could not
> start" label instead of the diagram). Once out-of-process JCEF is off, `false`
> does yield windowed rendering, but it measured no better than in-process OSR at
> the plugin's 60 fps — so there is no reason to touch it either way.

## Scope

BPMN editor + element templates + Notifier/StatusBar, plus diff, deployment, the
inline "Edit Script" tab, and the template marketplace (Tools ▸ Add / Update
Template Marketplace; the source list is edited on the Settings page, per-host
PATs live in `PasswordSafe`). DMN has no IntelliJ editor yet.

## Monorepo hygiene

This is a Gradle subproject, **not** a yarn workspace: it has no `package.json`,
so Yarn's `apps/*` glob ignores it, and the ESLint/Prettier/tsc globs only match
JS/TS, so the Kotlin sources are untouched. Build output (`build/`, `.gradle/`,
`.idea/`, `.kotlin/`) is gitignored.

## Cross-platform packaging (release follow-up)

This PR stages only the **host** platform's binary. Shipping to the JetBrains
Marketplace needs the Bun `--target` matrix (darwin-arm64/x64, linux-x64,
windows-x64) each staged under `bin/<os>-<arch>/`, plus macOS codesign /
notarization — tracked as the release-pipeline follow-up in the
runtime-distribution ADR.

## If `runIde` fails to resolve versions

The IntelliJ Platform Gradle Plugin and IDEA versions are pinned in
`build.gradle.kts` (`2.5.0`) and `gradle.properties` (`ideaVersion=2024.2.5`).
Bump them to a locally available combination if resolution fails.
