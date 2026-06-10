# Miranum BPMN Modeler — IntelliJ plugin

A third host for the Miranum BPMN modeler (after VS Code and Theia). It opens
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
  `-Dmiranum.bridge=/abs/path` or `MIRANUM_BRIDGE`.
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
the already-built artefacts. Build them from the repo root first:

```bash
corepack yarn build:libs
corepack yarn build:bpmn-webview          # → dist/webview-staging/bpmn-webview/
corepack yarn workspace @miragon/bpmn-modeler-bridge compile
                                          # → apps/modeler-bridge/dist/modeler-bridge
```

Then, from this directory:

```bash
./gradlew runIde
```

A sandboxed IntelliJ IDEA Community launches. Open any `.bpmn` file — it opens in
a **BPMN Modeler** tab and the diagram renders. Move/add an element, then
`Ctrl/Cmd+S`, and switch to the plain-text tab to confirm the round-tripped XML.
The status bar shows the engine version + template count; loading errors surface
as balloons. Tail the IDE log for `[bridge stderr]` lines to watch the seam.

### Crash-recovery / orphan check

Kill the `modeler-bridge` process (Activity Monitor / `kill`). The open editor
recovers (the session re-registers and the diagram re-renders) and no orphaned
process remains. Closing the IDE leaves no `modeler-bridge` process behind.

## Scope

BPMN editor + element templates + Notifier/StatusBar. DMN, diff, deployment, and
scriptTask are their own follow-up issues (#1067–#1073).

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
