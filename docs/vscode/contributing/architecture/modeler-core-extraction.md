# `modeler-core` extraction & the host-protocol seam

## Status

Accepted (#1060). Carries the host-protocol decision from the IntelliJ
host-parity track (#920).

## Context

The host-agnostic modeling engine — domain models, services, the
host-capability ports, and the `vscode`-free registries (`EditorSessionStore`,
`WebviewMessageRouter`, `DiffPaneStore`) — used to live inside
`apps/vscode-plugin/`. The #920 spike proved that this same engine can drive an
**out-of-process** host (IntelliJ, over a stdio bridge): editor render +
`Ctrl+S` write-back, element templates with live reload, and Git **Show Diff**
all worked against a Node subprocess. But the bridge had to reach into the
plugin's internals (`../modeler/…`, `../diff/…`, `../shared/…`), and every new
IntelliJ feature deepened that coupling.

## Decision

Extract the engine into its own package, **`@miragon/bpmn-modeler-core`**
(`libs/modeler-core/`):

- **Moves to the package:** every `domain/` and `service/` layer across features,
  plus the `vscode`-free infrastructure registries `EditorSessionStore`,
  `WebviewMessageRouter`, `DiffPaneStore`, and `helpers`.
- **Stays in `apps/vscode-plugin/`:** VS Code host code only — the `Vs*` port
  adapters, controllers, editor-session participants, the composition roots, the
  webview HTML/bootstrap, and `main.ts`.

The package is `vscode`-free by gate: `libs/modeler-core/src/architecture.spec.ts`
forbids any `vscode` import anywhere in the package and any Node host module
(`node:*`, `fs`, `http`) in `domain/`, including transitively (a file reaching a
host module through an imported sibling). Pure Node utilities present in any Node
host (`path`, `Buffer`) are allowed — they are not host capabilities.

Both consumers import only the package entrypoint (`@miragon/bpmn-modeler-core`):
the VS Code plugin in-process (direct calls), and the IntelliJ bridge
out-of-process (over RPC).

## Two distinct boundaries

These are easy to conflate; they are separate seams that ride alongside each
other.

1. **Core ↔ host — the host-capability ports** (this extraction's seam). The
   engine depends on the interfaces in `shared/domain/hostPorts.ts`
   (`NotifierPort`, `PickerPort`, `ClipboardPort`, `SettingsPort`,
   `WorkspacePort`, `DocumentPort`, `StatusBarPort`, `SecretStorePort`,
   `DeploymentStatePort`, `PropertiesPanelStatePort`) plus the editor/diff
   handles (`EditorHandle`, `DiffPaneHandle`). Each host supplies adapters: VS
   Code uses the `Vs*` classes; the bridge uses RPC-backed adapters.

2. **Host ↔ webview — the `Query`/`Command` protocol** (`libs/shared`). The
   typed `postMessage` contract between the host and the bpmn-js/dmn-js webview.
   This is **not** part of `modeler-core` and is unchanged by this extraction.

The two meet at `EditorHandle.postMessage(Query | Command)`: the engine speaks
the webview protocol *into a port*, and the host adapter is responsible for
actually delivering it to its webview (VS Code `Webview.postMessage`; the bridge
forwards it over RPC to the JCEF browser).

## Mapping the ports onto stdio JSON-RPC (the bridge)

The bridge is pure transport + port adapters — no modeling logic is
reimplemented per host. The seam is a line-delimited JSON-RPC (NDJSON) duplex
over the subprocess's stdio. The port methods group onto it as follows:

| Direction | RPC method(s) | Port / handle |
|---|---|---|
| host → core | `session/register`, `session/dispose` | editor lifecycle (seeds the `DocumentPort` mirror) |
| host → core | `document/didChange` | `DocumentPort` (host-side edit → mirror update) |
| host → core | `webview/message` | inbound `Command` → `WebviewMessageRouter` |
| host → core | `diff/open`, `diff/dispose`, `diff/webviewMessage` | `DiffPaneStore` / `DiffPaneHandle` |
| core → host | `document/write`, `document/save` | `DocumentPort.write` / `.save` |
| core → host | `editor/postMessage` | `EditorHandle.postMessage` (Query/Command → webview) |
| core → host | `diff/postMessage` | `DiffPaneHandle.postMessage` |
| core → host | `notifier/log` | `NotifierPort` |
| core → host | `statusBar/showEngineVersion` | `StatusBarPort` |

A key constraint the protocol solves: `BpmnModelerService.display()` reads
`DocumentPort.getContent()` **synchronously**, but RPC is async. The host
therefore pushes a document mirror into the core on `session/register` (LSP
`didOpen`-style) and keeps it current with `document/didChange`, so synchronous
reads hit a local cache instead of blocking on a round trip.

## Consequences

- The engine is host-agnostic by construction and by CI gate; a second host
  needs only to implement the ports, not re-implement modeling logic.
- The only logic touched during extraction was port-typing two services that
  had reached for concrete `Vs*` adapters (`BpmnSettingsBroadcaster`,
  `BpmnPropertiesPanelService`) — behaviour-neutral, since the concrete adapters
  already satisfy the ports. The transitive-reachability gate now prevents that
  class of leak from recurring.
- The webview protocol boundary is untouched, so this change is independent of
  the runtime-distribution decision (subprocess today; in-process/GraalVM later
  would reuse the identical package).

## Alternatives rejected

- **Leave the registries in the plugin, export only domain/service.** The bridge
  would have to re-implement `EditorSessionStore` / `WebviewMessageRouter` /
  `DiffPaneStore` — duplicated, drift-prone logic.
- **One mega-package.** Folding host adapters in defeats the purpose: the package
  could no longer guarantee `vscode`-freedom, and a non-VS-Code host could not
  consume it cleanly.
