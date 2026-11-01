---
name: intellij-plugin
description: The IntelliJ host (apps/intellij-plugin) and the modeler-bridge binary that runs modeler-core over stdio JSON-RPC. Use when working on its Gradle build, JCEF editors, plugin.xml, the RPC protocol or a blank IntelliJ webview.
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
rationale lives in the architecture-and-hosts ADR:
[runtime and transport](../../../docs/adr/architecture-and-hosts.md#runtime-and-transport),
[process lifecycle](../../../docs/adr/architecture-and-hosts.md#process-lifecycle), and
[state mirrors](../../../docs/adr/architecture-and-hosts.md#host-replicated-state).
For the engine those two consume, use the `architecture` skill.

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
| `copySchema` | `libs/shared/src/lib/deploymentTargets.schema.json` | `deployment-targets.json` schema |

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

Single NDJSON JSON-RPC duplex. The host (Kotlin) implements the core's host
ports (`hostPorts.ts` and the feature `domain/ports.ts` files) as RPC handlers;
the core never knows it isn't talking to VS Code. Selected methods (full table
in the bridge README):

| Direction | Method(s) | Port / handle |
|---|---|---|
| host → core | `session/register`, `session/dispose` | editor lifecycle (seeds the `DocumentPort` mirror) |
| host → core | `document/didChange` | external edit → re-render, own-write echo → no-op |
| host → core | `session/setActive` | focused tab → active-editor pointer |
| host → core | `webview/message` | inbound `Command` → `WebviewMessageRouter` |
| core → host | `document/write`, `document/save` | `DocumentPort` |
| core → host | `editor/postMessage` | Query/Command → webview |
| core → host | `notifier/*`, `statusBar/update` | `Notifications.Bus`, one `StatusSlotWidget` per status slot |
| host → core | `linting/toggle` | the BPMNlint widget's click flips the user's lint choice |
| core → host | `settings/setLintingEnabled` | `PropertiesComponent`; the host stores the lint choice and pushes the snapshot |
| core → host | `secretStore/*` | `PasswordSafe` (encrypted at rest) |
| host ⇄ core | `deployment/*`, `deploymentState/*` | tool-window webview + `PropertiesComponent` |

**Handler coverage.** `ProtocolHandlerCoverageTest` registers the production
`BridgeRouters` and fails when a core → host method in
`apps/modeler-bridge/src/protocol/protocol.json` has no Kotlin handler, or a
handler serves a method the core no longer sends. Adding or removing a
core → host method therefore changes the descriptor, `protocol.json` and the
Kotlin router in one PR. It also compares parameter and result keys: every
host → core sender runs once and its frame must carry the descriptor's keys,
and every core → host handler may read only the descriptor's keys. A handler
reads its `RpcParams` and returns an `RpcAction`, so the test reads without
acting; a read inside the action throws. A reply carries an `RpcResult` class
from `RpcResults.kt`, and its property names must match the descriptor's
`resultKeys`. A new host → core method needs an entry in the test's sender
table, a new core → host request with a result one in its result table.
The nested fields of `statusBar/update` are pinned by `HostUiRouterTest`, and
`StatusSlotPlacementTest` reads the core's `statusView.ts` (passed in by Gradle)
so a new slot, icon, tone or action fails until Kotlin knows it.

**Settings rules.** The bridge reads every host snapshot through the core's
`normalizeSettings`; `ModelerSettingsStore` keeps the Kotlin copy.
`ModelerSettingsStoreTest` runs the rows of
`libs/modeler-core/src/kernel/domain/settingsNormalization.cases.json` against
the store and compares its defaults with `apps/vscode-plugin/package.json`, both
passed in as Gradle system properties. A rule change edits the rows, the
TypeScript rule and the Kotlin copy in one PR. `ModelerLocalesTest` holds the
language list of `ModelerLocales` to the manifest's `miragon.bpmnModeler.language`
codes and labels, which `manifest.contract.spec.ts` holds to the shipped catalogue.

**Host-replicated mirrors.** `BpmnModelerService.display()` reads
`DocumentPort.getContent()` *synchronously* — impossible over async RPC. The host
seeds a local `DocumentMirror` on `session/register` and keeps it current via
`document/didChange`, so reads hit a cache. Same pattern for settings and
deployment state. **The `document/write` reply is the causation signal**: the
host sends no `document/didChange` echo for the bridge's own writes, so every
`didChange` is external and re-renders, and `documentRevision` rejects a stale
write. See the ADR's
[Document causation and session identity](../../../docs/adr/architecture-and-hosts.md#document-causation-and-session-identity).
To add a new synchronous port, follow
[Host-replicated state](../../../docs/adr/architecture-and-hosts.md#host-replicated-state).

## plugin.xml extension points

`apps/intellij-plugin/src/main/resources/META-INF/plugin.xml` registers:

| EP | Implementation |
|---|---|
| `fileType` (`.bpmn`) | `BpmnFileType` |
| `fileEditorProvider` | `BpmnFileEditorProvider` → `BpmnFileEditor` (JCEF); `ElementTemplatePreviewEditorProvider` → JSON editor + `ElementTemplatePreviewEditor` in a `TextEditorWithPreview` (bridge-free) |
| `postStartupActivity` | `BridgeWarmupActivity` (pre-warm the bridge off-EDT) |
| `diff.DiffTool` | `BpmnDiffTool` (two-pane JCEF diagram diff) |
| `statusBarWidgetFactory` | one `StatusSlotWidgetFactory` subclass per slot (element templates, engine, BPMNlint, deployment target) |
| `notificationGroup` | `Miragon BPMN Modeler` (BALLOON) |
| `applicationConfigurable` | `ModelerSettingsConfigurable` (Settings ▸ Tools) |
| `documentationProvider`, `daemon.highlightInfoFilter` | script-tab support |
| `toolWindow` | `Miragon Deployment` → `DeploymentToolWindowFactory` |

Groovy (script tab) and JSON (deployment-targets schema) support are optional dependencies
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
- **Element templates**: `ElementTemplatePreviewEditor(Provider).kt` and `ElementTemplatePreviewMessages.kt` (the page's protocol, answered in Kotlin);
  `ElementTemplateFiles.kt` and `NewElementTemplates.kt` copy the TypeScript rules and run their `*.cases.json` rows in tests
- **Shell CSP**: `WebviewContentSecurityPolicy.kt` — the header `WebviewServer` sends with both HTML shells; it allows the
  inline `acquireVsCodeApi` shim by hash, so editing the shim updates the hash pinned in `WebviewContentSecurityPolicyTest`
- **Transport**: `bridge/RpcChannel.kt`, `bridge/ProcessSupervisor.kt`, `bridge/BridgeBinaryResolver.kt`, `bridge/BridgeProcessLauncher.kt`; routers `bridge/*Router.kt`, composed in `bridge/BridgeRouters.kt`
- **Display/secret ports**: `HostNotifications.kt`, `IntellijSecretStore.kt`; status slots in
  `StatusView.kt` (the core's unions), `StatusBarSlots.kt` (placement), `AutoHidingStatusSlots.kt`
  (the 3 s transient rule) and `StatusSlotWidget(Factory).kt`
- **Deployment**: `DeploymentToolWindowFactory.kt`, `IntellijDeploymentState.kt`
- **plugin.xml**: `src/main/resources/META-INF/plugin.xml`

Bridge (`apps/modeler-bridge/src/`):
- `server.ts` (entrypoint, binds the process streams), `stdioBinding.ts`
  (stdin frames, `[core]`-tagged stderr lines), `bridge.ts` (wires core to
  adapters), `rpc.ts` (NDJSON peer),
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
- **Project fixtures in tests**: use `projectFixtureWithoutServicePreload()`,
  not plain `projectFixture()`. Preloaded platform services finish after the
  fixture closes the project on the 2-core CI runner and trip the
  `LeakHunter` check (`JUnit Jupiter > executionError`). It also waits for the
  `RunManager` the platform builds in the background, otherwise a fast test
  disposes the project under its constructor ("Uncaught exceptions … parent:
  Project … (disposed) [Plugin: com.jetbrains.codeWithMe]"). Reproduce CI-only
  flakes locally with `JAVA_TOOL_OPTIONS=-XX:ActiveProcessorCount=2`.
- **Plugin code runs on the IDE's Kotlin stdlib** (1.9 on the 242 floor).
  Kotlin API 2.2+ emits `SpillingKt.nullOutSpilledVariable` in suspend
  functions that keep a local across a suspension point, which fails with
  `NoClassDefFoundError` there. The `kotlin { compilerOptions }` block pins
  `apiVersion` to 2.1 for main and test; do not raise it while the
  `sinceBuild` floor bundles a stdlib older than 2.2 (2025.2 still bundles
  2.1.20, 2025.3 is the first with 2.2). Direct stdlib calls resolve against
  the `ideaVersion` stdlib on the compile classpath (1.9.24 for 2024.2.5), so
  newer functions fail to compile; only references the compiler generates
  itself depend on `apiVersion`. `verifyPlugin` checks the jar against
  2024.2.5 and fails on any that slip through.
