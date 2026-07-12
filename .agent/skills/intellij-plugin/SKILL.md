---
name: intellij-plugin
description: The IntelliJ host for the BPMN modeler (apps/intellij-plugin, Kotlin/Gradle) and the apps/modeler-bridge stdio JSON-RPC Bun binary that runs the unmodified @miragon/bpmn-modeler-core out-of-process. Covers the Gradle build/run order (build:libs → build:bpmn-webview → bridge compile → ./gradlew runIde), webview bundle staging and the blank-webview trap, the version-keyed bridge-binary cache trap and the -Dmiragon.bridge dev override, the JCEF editor + JBCefJSQuery message relay, the RPC method contract and host-replicated mirrors (document/settings/deployment), plugin.xml extension points, and the process supervisor. Use this skill whenever working on the IntelliJ plugin, the modeler-bridge, JCEF editors/tool windows, plugin.xml, Gradle tasks, RPC adapters, a blank IntelliJ webview, verifyPlugin, or debugging the IntelliJ↔bridge seam. See the architecture skill for the host-agnostic core these two consume.
---

# IntelliJ Plugin + Modeler Bridge

The IntelliJ plugin is a **third host** for the modeler (after VS Code and
Theia/standalone). It opens `.bpmn` files in a **JCEF** (embedded Chromium)
editor rendering the *same* bpmn-js webview bundle, and round-trips edits to
disk — while running the **unmodified** `@miragon/bpmn-modeler-core` engine
**out-of-process** as a supervised, Node-free binary. The Kotlin side is **pure
transport + port adapters**; the engine is never reimagined in Kotlin.

```
apps/intellij-plugin/      Kotlin/Gradle plugin (JCEF host, UI, process supervisor)
apps/modeler-bridge/       Bun binary: stdio JSON-RPC server wrapping the TS core
```

Read the two READMEs first — they are authoritative and kept current:
`apps/intellij-plugin/README.md`, `apps/modeler-bridge/README.md`. Deeper
rationale lives in the ADRs under
`docs/vscode/contributing/architecture/`: `intellij-host-foundation.md`
(transport + topology), `runtime-distribution.md` (Bun binary), and
`host-replicated-state.md` (the synchronous-read mirrors). For the engine those
two consume, use the `architecture` skill.

## Two design decisions (know these)

- **One stdio JSON-RPC pipe.** Core↔host *and* the webview-message relay ride a
  single supervised NDJSON pipe over the bridge's stdin/stdout — **not** a
  webview↔server WebSocket. `stdout` is RPC frames only; `stderr` is diagnostics
  (tail the IDE log for `[bridge stderr]`). One transport ⇒ one crash signal, no
  embedded HTTP/WS server, no open TCP port.
- **One core per project.** `CoreProcess` is a project-level `@Service`, lazily
  spawned on the first `.bpmn` open and torn down with the project. A bridge
  crash is isolated to one window; the bridge exits on stdin EOF so a dying JVM
  never orphans it.

## Build & run — order matters

The Gradle build does **not** invoke the JS/Bun toolchain — it only *packages
already-built artefacts*. Build them from the repo root first, then run Gradle:

```bash
# repo root — engine + webview + bridge binary:
corepack yarn build:libs
corepack yarn build:bpmn-webview          # → dist/webview-staging/bpmn-webview/
corepack yarn workspace @miragon/bpmn-modeler-bridge compile
                                          # → apps/modeler-bridge/dist/modeler-bridge

# apps/intellij-plugin/ :
./gradlew runIde                          # sandboxed IntelliJ IDEA Community
```

Other Gradle tasks: `./gradlew build`, `./gradlew verifyPlugin` (binary-
compatibility gate). Versions are pinned in `build.gradle.kts` (IntelliJ
Platform Gradle Plugin `2.17.0`) and `gradle.properties` (`ideaVersion=2024.2.5`,
JCEF requires 2024.2+); bump to a locally available combo if resolution fails.
This subproject is **not** a yarn workspace (no `package.json`), so the JS
lint/tsc globs never touch the Kotlin sources.

### Staging (where "already-built artefacts" come from)

`build.gradle.kts` registers `Copy` tasks that `processResources` /
`PrepareSandboxTask` depend on:

| Task | Source | Lands at (classpath) |
|---|---|---|
| `copyWebview` | `dist/webview-staging/bpmn-webview/` | `/webview/…` |
| `copyDeploymentWebview` | `dist/webview-staging/deployment-webview/` | deployment webview |
| `copyBridge` | `apps/modeler-bridge/dist/modeler-bridge` | `/bin/<os>-<arch>/modeler-bridge` |
| `copySchema` | `libs/shared/src/lib/variableManifest.schema.json` | `*.bpmn.vars.json` schema |

Each task has a `doFirst` that throws a `GradleException` naming the exact yarn
command if its source is missing. Release builds pass `-PbundleAllPlatforms` to
stage every platform binary from `apps/modeler-bridge/dist/<os>-<arch>/`.

## Trap 1 — a blank webview is (almost always) an unstaged bundle

A blank JCEF editor/tool-window is a **silent 404 on the bundle**, not a Kotlin
regression. `WebviewServer` serves whatever was staged; if the bundle wasn't
(re)built, there is nothing to serve. Fix: rebuild the specific webview and
relaunch —

```bash
corepack yarn build:bpmn-webview     # (or build:deployment-webview)
# then re-run ./gradlew runIde
```

Do not go hunting in Kotlin first. Verify the staged file exists under the
sandbox before suspecting code. (See also the user-memory note
"intellij empty webview missing bundle".)

## Trap 2 — the bridge binary is cached, version-keyed

`BridgeBinaryResolver` extracts the bundled binary to a **stable, plugin-
version-keyed** cache dir under the IDE system path
(`PathManager.getSystemPath()/…/<version-key>/modeler-bridge`) — this keeps
Windows Defender from re-scanning a fresh temp path every launch. The
consequence: **recompiling the bridge does not change what `runIde` spawns** if
the plugin version is unchanged — the resolver reuses the already-extracted
cached binary.

To iterate on the bridge, bypass the cache with the dev override — point
`CoreProcess` straight at your freshly built binary (or run from source):

```bash
./gradlew runIde -Dmiragon.bridge=$PWD/../modeler-bridge/dist/modeler-bridge
# or:  MIRAGON_BRIDGE=/abs/path/modeler-bridge ./gradlew runIde
```

Otherwise you must clear the version-keyed cache dir under the sandbox system
path before relaunching. (User-memory: "intellij bridge binary extraction
cache".)

## The RPC contract (bridge ⇄ host)

Single NDJSON JSON-RPC duplex. The host (Kotlin) implements the core's
`hostPorts.ts` interfaces as RPC handlers; the core never knows it isn't talking
to VS Code. Selected methods (full table in the bridge README):

| Direction | Method(s) | Port / handle |
|---|---|---|
| host → core | `session/register`, `session/dispose` | editor lifecycle (seeds the `DocumentPort` mirror) |
| host → core | `document/didChange` | external edit → re-render, own-write echo → no-op |
| host → core | `session/setActive` | focused tab → active-editor pointer |
| host → core | `webview/message` | inbound `Command` → `WebviewMessageRouter` |
| core → host | `document/write`, `document/save` | `DocumentPort` |
| core → host | `editor/postMessage` | Query/Command → webview |
| core → host | `notifier/*`, `statusBar/*` | `Notifications.Bus`, `EngineStatusBarWidget` |
| core → host | `secretStore/*` | `PasswordSafe` (encrypted at rest) |
| host ⇄ core | `deployment/*`, `deploymentState/*` | tool-window webview + `PropertiesComponent` |

**Host-replicated mirrors.** `BpmnModelerService.display()` reads
`DocumentPort.getContent()` *synchronously* — impossible over async RPC. The host
seeds a local `DocumentMirror` on `session/register` and keeps it current via
`document/didChange`, so reads hit a cache. Same pattern for settings and
deployment state. **Echo prevention is explicit-causation** (LSP-style): every
`document/write` mints a per-editor revision echoed back as `causedBy`; a
`didChange` whose `causedBy` matches a pending own write is dropped. The core's
`ModelerSession` guard stays as a second line of defence. To add a new
synchronous port, follow the checklist in `host-replicated-state.md`.

## plugin.xml extension points

`apps/intellij-plugin/src/main/resources/META-INF/plugin.xml` registers:

| EP | Implementation |
|---|---|
| `fileType` (`.bpmn`) | `BpmnFileType` |
| `fileEditorProvider` | `BpmnFileEditorProvider` → `BpmnFileEditor` (JCEF) |
| `postStartupActivity` | `BridgeWarmupActivity` (pre-warm the bridge off-EDT) |
| `diff.DiffTool` | `BpmnDiffTool` (two-pane JCEF diagram diff) |
| `statusBarWidgetFactory` | `EngineStatusBarWidgetFactory` |
| `notificationGroup` | `Miragon BPMN Modeler` (BALLOON) |
| `applicationConfigurable` | `ModelerSettingsConfigurable` (Settings ▸ Tools) |
| `documentationProvider`, `daemon.highlightInfoFilter` | script-tab support |
| `toolWindow` | `Miragon Deployment` → `DeploymentToolWindowFactory` |

Groovy (script tab) and JSON (vars schema) support are optional dependencies
loaded via config-file (`modeler-groovy.xml` / `modeler-json.xml`) only when
those platform modules are present.

**Before editing plugin.xml**, verify EP names/interfaces against the cached
IntelliJ SDK jars offline rather than guessing — the SDK moves EPs and signatures
between releases (user-memory: "intellij sdk ep verification"). `./gradlew
verifyPlugin` (from the IntelliJ Platform Gradle Plugin) is the task that catches
wrong EPs / removed-API usage — run it before shipping. Note IDEA Community
stopped publishing as a standalone artifact in 2025.3; for 261+ use the unified
`IntellijIdea` platform type (user-memory: "intellij plugin verifier setup").

## Key files

Kotlin (`apps/intellij-plugin/src/main/kotlin/io/miragon/intellij/bpmn/`):
- **Supervisor / composition root**: `CoreProcess.kt`; warmup `BridgeWarmupActivity.kt`
- **JCEF editor**: `BpmnFileEditorProvider.kt`, `BpmnFileEditor.kt`; asset server `WebviewServer.kt`
- **Transport**: `bridge/RpcChannel.kt`, `bridge/ProcessSupervisor.kt`, `bridge/BridgeBinaryResolver.kt`, `bridge/BridgeProcessLauncher.kt`; routers `bridge/*Router.kt`
- **Display/secret ports**: `HostNotifications.kt`, `EngineStatusBarWidget(Factory).kt`, `IntellijSecretStore.kt`
- **Deployment**: `DeploymentToolWindowFactory.kt`, `IntellijDeploymentState.kt`
- **plugin.xml**: `src/main/resources/META-INF/plugin.xml`

Bridge (`apps/modeler-bridge/src/`):
- `server.ts` (entrypoint, wires core to adapters), `rpc.ts` (NDJSON peer),
  `adapters.ts` (`DocumentMirror` + `Rpc*` ports), `nodeAdapters.ts` (pure-`fs`
  `WorkspacePort`/`SettingsPort`).
- `package.json`: `build` = typecheck + `compile`; `compile` = `bun build
  --compile … --outfile dist/modeler-bridge`; `compile:all` = the `--target`
  matrix (darwin-arm64/x64, linux-x64/arm64, windows-x64); `start` = run from
  source (needs `bun` on PATH).

## Other gotchas (from experience)

- **Tool-window stripe icon stays dim on select** unless the palette color
  (`#6C707E` idle / `#CED0D6` selected) sits on the `<path>`, not the root
  `<svg>` (user-memory: "intellij toolwindow stroke icon recolor").
- **Script-tab Groovy binding types**: `GrBindingVariable.setType` throws at
  runtime — use `GrLightVariable`; verify method *bodies*, not just signatures,
  against the cached SDK (user-memory: "intellij grbindingvariable settype
  stub").
- **Hosting a code-insight/completion test** in the JUnit5 suite fights the
  `@TestApplication` leak tracker — see the recipe in user-memory "intellij
  codeinsightfixture leaks under testapplication".
