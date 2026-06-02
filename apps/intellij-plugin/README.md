# Miranum BPMN Modeler — IntelliJ plugin (spike)

A proof-of-concept third host for the Miranum BPMN modeler. It opens `.bpmn`
files in a **JCEF** (embedded Chromium) editor tab, renders them with the
**existing** bpmn-js webview bundle, and round-trips edits back to disk — while
running the **unmodified TypeScript core out-of-process**.

## What this spike proves (and why it's shaped this way)

The hard constraint behind issue #920: the modeler core must stay in TypeScript,
a single source of truth — it will not be maintained in two languages. A
"rewrite the host in Kotlin" approach fails that, because the service layer calls
the host-capability ports and the message handlers wire webview messages to
services, so reimplementing the adapters in Kotlin drags the whole domain +
service layer across the language line.

So this spike validates the only architecture that satisfies the constraint —
the **out-of-process core** (the deferred design from #1040):

- The real `EditorSessionStore` + `BpmnModelerService` + `WebviewMessageRouter`
  run **unchanged** in a `node` subprocess (`dist/host-bridge/server.js`).
- Kotlin is **pure transport + port adapters**. It implements the host-capability
  ports as JSON-RPC handlers and owns no modeling logic.

It deliberately de-risks the two things that are expensive to get wrong:

1. **`EditorHandle` over RPC** — the one port that is a *stateful, bidirectional*
   channel. The JCEF browser lives in Kotlin; the core drives it remotely by
   emitting `editor/postMessage`, which the host turns into `window.postMessage`.
2. **The synchronous-read mismatch** — `BpmnModelerService.display()` reads
   `DocumentPort.getContent()` *synchronously*, impossible over async RPC. The
   host pushes a **document mirror** into the core on open (`session/register`,
   LSP `didOpen` style) so the core reads a local cache instead of blocking.

## How it works

```
.bpmn ─▶ BpmnFileEditorProvider ─▶ BpmnFileEditor (JCEF browser)
                                       │   ▲
   loads http://127.0.0.1:<port>/...   │   │ window.postMessage (Query/Command)
                                       ▼   │
                              WebviewServer (serves the pre-built bundle)
                                       │
   bpmn-js webview (Chromium) ─postMessage▶ JBCefJSQuery ─┐
                                                          │
                       ┌──────────── CoreProcess (Kotlin) ┘   pure transport +
                       │             ▲     │                  port adapters
        webview/message│ editor/     │     │ document/write,
        session/*      │ postMessage │     │ document/save
                       ▼             │     ▼
        ┌──────── node dist/host-bridge/server.js (REUSED TS core) ────────┐
        │ EditorSessionStore + BpmnModelerService + WebviewMessageRouter   │
        └──────────────────────────────────────────────────────────────────┘
```

- **`CoreProcess`** — spawns/supervises `node`, frames bidirectional NDJSON
  JSON-RPC, and implements the document port against the IntelliJ `Document`.
- **`server.ts` / `adapters.ts` / `rpc.ts`** (in `apps/modeler-plugin/src/host-bridge/`)
  — the Node side: RPC peer, RPC-backed `EditorHandle`/`DocumentPort` + stub
  Notifier/Picker/StatusBar, wiring the real core. Bundled by `esbuild.bridge.mjs`.
- **`WebviewServer`** — loopback HTTP server for the webview assets. `http://`
  (not `file://`) is mandatory: the bundle is an ES module and Chromium blocks
  module loading over `file://`. It also synthesises the `index.html` shell
  (Vite emits none) and injects the `acquireVsCodeApi()` shim.
- **`BpmnFileEditor`** — owns the browser and the message pipes only; forwards
  every webview message to the core and pushes every core message to the page.

## Build & run

Prerequisites — build the webview bundle **and** the core bridge from the repo
root (this Gradle build does not invoke the JS toolchain, it only packages the
results):

```bash
corepack yarn build:bpmn-webview   # → dist/webview-staging/bpmn-webview/index.js
corepack yarn build:bridge         # → dist/host-bridge/server.js
```

`node` must be on `PATH` (the plugin spawns the core with it; override with
`-Dmiranum.node=/path/to/node` or the `MIRANUM_NODE` env var). Then, from this
directory:

```bash
./gradlew runIde
```

A sandboxed IntelliJ IDEA Community launches. Open any `.bpmn` file (e.g.
`resources/example-process/example-process.bpmn`). It opens in a **BPMN Modeler**
tab and the diagram renders — which proves the full loop: webview
`GetBpmnFileCommand` → JCEF → Kotlin → RPC → core `display()` → mirror read →
`editor/postMessage(BpmnFileQuery)` → JCEF. Move or add an element, then
`Ctrl/Cmd+S`, and switch to the plain-text editor tab to confirm the
round-tripped XML changed (the write leg: `SyncDocumentCommand` → core `sync()`
→ `document/write`).

To watch the seam directly, tail the IDE log for `[core stderr]` /
`[core] engine …` / `[webview] BPMN modeler is ready` lines.

## Deliberate spike-level shortcuts

- **BPMN only** — DMN, deployment, diff, and scriptTask are not wired.
- **`node` spawned from `PATH`** — no bundled runtime. Shipping a self-contained
  binary (Node SEA / `pkg` / Bun compile) is the real productionization wildcard,
  out of scope here.
- **No `libs/modeler-core` extraction yet** — the bridge imports the plugin's
  `domain`/`service`/store/router sources directly (all already `vscode`-free).
  Extraction into a package is the productionization step, justified now that a
  real second consumer exists.
- **Secondary-handshake replies are bridge-level stubs** — element templates
  (`[]`), settings (defaults, `colorTheme: light`), properties-panel state
  (visible), clipboard (empty). Their real services pull in workspace/settings
  adapters that are out of scope; the stubs only exist so the webview's bootstrap
  `Promise.all` resolves. Engine + version are **really** detected from the XML
  by the core (not hard-coded).
- **One core process**, no crash-recovery/multi-project supervision.
- **Theme fixed to light**; **no external-edit → webview resync**.
- **Icon font** is loaded from the base64-embedded `bpmn-embedded.css` (the
  bpmn-font `viteStaticCopy` glob nests the non-embedded variant's assets so its
  relative `../font/*` URLs don't resolve in this layout).

## Monorepo hygiene

This is a Gradle subproject, **not** a yarn workspace: it has no `package.json`,
so Yarn's `apps/*` glob ignores it, and the ESLint/Prettier/tsc globs only match
JS/TS, so the Kotlin sources are untouched. The Node bridge, by contrast, *is*
part of the yarn graph (it lives under `apps/modeler-plugin/src/host-bridge/` and
is bundled by the `vs-code-bpmn-modeler` workspace) precisely so it can import the
shared core. Build output (`build/`, `.gradle/`, `.idea/`, `.kotlin/`) is
gitignored at the repo root.

## If `runIde` fails to resolve versions

The IntelliJ Platform Gradle Plugin and IDEA versions are pinned in
`build.gradle.kts` (`2.5.0`) and `gradle.properties` (`ideaVersion=2024.2.5`).
Bump them to a locally available combination if resolution fails.
