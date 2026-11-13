# Architecture and hosts

- Status: accepted
- Last reviewed: 2026-11-12

## Context

The same modeling features serve embeddable browser consumers, VS Code,
Theia/Electron, IntelliJ and Orca. Sharing them requires separate boundaries for
browser composition, host-independent services, host facilities, and private
webview messages. Otherwise each host either duplicates modeling logic or
depends on another host's internals.

## Contents

- [Package boundaries](#package-boundaries)
- [Workspace kinds and role folders](#workspace-kinds-and-role-folders)
- [Host integrations](#host-integrations)
- [Runtime and transport](#runtime-and-transport)
- [Process lifecycle](#process-lifecycle)
- [Host-replicated state](#host-replicated-state)
- [Document causation and session identity](#document-causation-and-session-identity)
- [Shared host caches](#shared-host-caches)
- [Alternatives and consequences](#alternatives-and-consequences)

## Decision

### Package boundaries

Applications consume packages and libraries; packages consume reusable
libraries; libraries import neither applications nor modeler packages.

| Layer | Responsibility |
| --- | --- |
| `packages/bpmn-modeler`, `packages/dmn-modeler` | Published, host-free browser composition and deliberately designed factory/handle APIs |
| Private feature libraries in `libs/` | Reusable behavior, inlined into published packages where needed |
| `libs/modeler-types` | Public, host-agnostic concepts and browser utilities suitable for publication, and pure rules browser code shares with the core |
| `libs/shared` | Private Query/Command protocol, host channel, document-flush plumbing and webview chrome |
| `libs/modeler-core` | Host-independent domain/service layers and shared editor, routing and diff registries |
| Host applications and webview bootstraps | Concrete adapters, composition, transport, editor lifecycle and page integration |

The public browser contract is the factory/handle API, not Query/Command or
host-specific DI wiring. Published browser code cannot import `modeler-core`
or `shared`. Private browser libraries are inlined; the upstream bpmn-io stacks
remain declared npm dependencies so consumer plugins share their instances.
Externalization does not remove upstream watermark and license-notice
obligations; document them in the package README. Do not publish each private
feature library as an independently versioned API.

Placement in `modeler-types` requires freedom from the private protocol and
either a surface worth publishing or a pure rule that both browser code and the
core apply. Portable mode types, disposable primitives, engine versions, canvas
utilities and `isTextEditingSurface` qualify as surface. Script-surface
addressing (`scriptSurface.ts`) is such a shared rule, and so is the XML comment
and CDATA scan (`xmlMarkup.ts`) behind the published `extractModelDefinitions`,
the core's workspace content search and code-link. Process-variable extraction
(`processVariables.ts`) belongs here too: the BPMN webview runs it on the live
model, and the core's script domain keeps the `VariableDef`s it yields, which
the protocol only carries. Browser code cannot import the core, whose barrel
exports Node-only modules, so a rule both apply has no other common home. The
package is private and inlined. A package entry's declaration roll-up ships
what the entry re-exports by name and, unnamed, every declaration a public type
references, such as the `SurfaceThemeMode` behind `ThemeMode`. A consumer
cannot import such a declaration, but an edit to it changes the published types
of `@miragon/bpmn-modeler` or `@miragon/dmn-modeler` without a change in their
own sources. `check-dts` scans the whole roll-up, unnamed declarations
included, for protocol symbols, private-lib imports and ambient functions with
a body, and in `@miragon/dmn-modeler` for `dmn-js` imports too; it does not
notice a changed declaration. `publicApi.spec.ts` pins only
the public names it lists, so an edit to an unpinned unnamed declaration that
still compiles ships without a failing check. A shared rule adds nothing to the
npm surface while no public type references its types. A rule there keeps its
module free of top-level side effects, so a bundle that does not use it leaves
it out. A rule only the core applies stays in the core's `domain/`.
DOM-id-coupled panel resizers, focus/shortcut bindings and the VS Code
body-class theme adapter belong in `shared`. This deliberately mixes private
browser chrome with the protocol to avoid another workspace for a few helpers.

`modeler-core` owns domain/services, the editor-session core
(`EditorSessionStore`, `WebviewMessageRouter`, `EditorSessionLifecycle`) and
`DiffPaneStore`. Host applications import its public entrypoint and supply
capability ports and editor/diff handles. The core is VS Code-free, and no core
file reaches a host module (`node:*`, `fs`, `http`), directly or transitively.
This does not make the whole core browser-safe: portable Node utilities such as
`path` remain valid there.

Inside the core, each feature folder (`modeler/<editor>` for the editors) is a
context with the [role folders](#workspace-kinds-and-role-folders) it needs:
`domain/`, `port/`, `service/` (the editor-session participants included),
`adapter/in/` (the `*MessageHandlers` tables), `adapter/out/` and
`composition/`, where the `*Feature` module wires the context. `domain/`
imports only domain modules, `@miragon/bpmn-modeler-types` and Node `path`.
Two contexts are shared, and the others reach each other only through them,
composition included. A context's `domain/` may import only its own `domain/`
and the `domain/` of `kernel/` and `editorSession/`.

- `kernel/` holds the vocabulary several features build on: `BpmnDocument`,
  engine versions, the workspace path, config-folder, glob, containment and
  watcher rules, the cross-cutting errors, the host ports
  (`kernel/port/hostPorts.ts`), and the HTTP contract (`HttpClient` in
  `port/`, `HttpTransportError` and `loggableHost` in `domain/`) with its fetch
  adapter. A service joins `kernel/service/` only when at least two features
  use it, as `ArtifactService` and the workspace file search do. `kernel/`
  imports no other folder, so it stays the bottom layer.
- `editorSession/` is the application core every editor runs on. Its
  `service/` holds the store, lifecycle, router, document sync, ordered
  dispatch, flush services, webview log routing and the render participant,
  and `adapter/in/` the inbound document, focus, log and notification
  handlers. Its `domain/` keeps the session events, the participant contract,
  the echo guard and status-item ownership. `EditorHandle` is a port: the host
  implements it, and its `postMessage` speaks the private protocol.
  `EditorSessionDocuments` implements `DocumentPort` on top of the store, so
  it is a service, not an adapter. `editorSession/` imports only `kernel/`,
  which the cross-feature rule already implies.

A context that lists what other contexts own declares structural ports in its
own `port/` and leaves the rules with the owners. `addOns/` (the add-on
catalog behind the Add-ons view) is the first. The ports of
`addOns/port/addOnSourcePorts.ts` are met by inventories that import nothing
of `addOns/`: `PluginAddOnSource` by `PluginInventory` in
`bpmnPlugins/service/`, `RulePackageAddOnSource` and `TemplateAddOnSource` by
`RulePackageInventory` and `TemplateInventory` in `modeler/bpmn/service/`, and
`MarketplaceAddOnSource` by `MarketplaceInventory` in
`template-marketplace/service/`, which `createMarketplaceCommands` builds over
the host's `MarketplaceCommands`. The host compositions hand one to the other,
as they hand `CachedTemplateProvider` to the BPMN editor. The values both
sides name live in `kernel/domain/`: `ListedPresence` in `listedCode.ts`,
`ApprovableCodeTexts` in `codeApproval.ts`, the template file listing in
`templateListing.ts` and the marketplace listing in `marketplaceListing.ts`,
from which the catalog derives its own view with the templates read. The context is
named `addOns` after the view it serves, **Add-ons**; the `Artifact` prefix
in the core belongs to `ArtifactService`.

The shared role-folder rules keep services off adapters, outbound adapters off
services, and every import away from the package entry and the test kit; the
core has no import cycles. A port file holds only types: interfaces, type
aliases and type-only re-exports. The value types, errors and pure functions a
port names stay in `domain/`, so the domain never imports a port. A port,
prompt or error one feature owns lives in that feature's `port/` or `domain/`,
so `kernel/` names no feature.
`EditorSessionParticipant` stays in `editorSession/domain/`: it is an in-core
extension point the lifecycle drives, not a port a host implements.
A store that holds application state and reaches the host, if at all, only
through ports, such as `MarketplaceCache` and `DiffPaneStore`, lives in its
feature's `service/` with no port of its own, and so does `DiffSession`, which
holds the panes' `DiffPaneHandle` port. The core architecture test enforces
the core's own rules (no host module, the domain package allowlist, the
context rules) and lists no exception today. A new one names the issue that
removes it, and the test fails when one is no longer needed, so the lists only
shrink.

The core/host seam and the host/webview seam are distinct. The core reaches
documents, settings, notifications, pickers, secrets and other host facilities
through ports. It sends private Query/Command messages through
`EditorHandle.postMessage`; the adapter delivers them to the actual webview.
The protocol can change across all in-repo hosts in one change without becoming
a public browser API commitment.

Each message class fixes its `type` as a string literal (`Command<"X">`), and
`libs/shared` derives the discriminated unions `ProtocolQuery`,
`ProtocolCommand` and `MessageOfType<"X">` from those classes. The router's
`on(type, handler)` hands each handler the narrowed message, and webview and
host switches narrow on `type` instead of casting, so a misspelt type or a
payload mismatch fails to compile. Inbound messages stay untrusted JSON: a
switch narrows them once (`asProtocolMessage`) and ignores unknown types, and a
handler table finds no entry for them. Code that owns a closed set makes a
missing type a compile error: a handler table has a mapped type that needs an
entry for every type (the BPMN webview's session messages in
`apps/bpmn-webview/src/adapter/in/messageRouter.ts`, a host's
`CommandTable`). TypeScript does not check the keys a table gets through
spreads, so a spec checks that no two spread handler groups name the same
type. The classes remain the constructors and the wire format is unchanged:
the same `type` strings and fields, which the IntelliJ host matches.

The commands the BPMN editor webview may post are a closed set, kept as a value
so a host can iterate it: `BPMN_EDITOR_COMMAND_TYPES` in
`libs/shared/src/lib/bpmnEditorCommands.ts`. The webview's `HostChannel` takes
only those, and the bootstrap narrows its host to it once, so neither the
bootstrap nor an adapter or service it hands that channel can post another
surface's command or a query.
`HostApi` declares its members as properties, not methods, because TypeScript
compares a method's parameters bivariantly: the narrowed channel could
otherwise be handed to a helper typed for every message. The shared
`WebviewDocumentSync` takes a channel for exactly the three messages it posts,
so handing it the BPMN channel proves they are on the list. The diff pane,
which the bootstrap starts instead of the editor, posts through its own
`DiffPaneChannel`, typed to the closed `DIFF_PANE_COMMAND_TYPES`
(`libs/shared/src/lib/diffPaneCommands.ts`), so it cannot post an editor
command. Both hosts route a pane's commands through the core's
`createDiffPaneRouter`, a `CommandTable` whose handlers get the pane. The table
covers that list and `DIFF_PANE_HANDSHAKE_COMMAND_TYPES`, the editor requests
the page posts before it knows it is a diff pane: it answers the file request
and ignores the settings and panel-state requests, which a read-only pane does
not use. A `DiffPaneHostExtensions` entry a host leaves out makes its command
ignored: both hosts supply the pane log; VS Code also supplies the swap, and
the bridge does not, because IntelliJ's diff viewer swaps the sides before it
forwards a message. The preview host's spec posts every command of the editor
and diff-pane lists.

A DMN diff pane posts through its own list, `DMN_DIFF_PANE_COMMAND_TYPES`,
routed by `createDmnDiffPaneRouter`. It has no handshake: the DMN bootstrap
creates its modeler before the file arrives, so VS Code names the page a diff
pane in its HTML (`<body data-surface="dmnDiffPane">`) and the page loads the
diff bootstrap instead of the editor. VS Code's `bootstrapWebview(panel, page)`
takes a `WebviewPage`: an editor page (`viewType`, `initialPanelVisible`) or a
diff pane page that names its surface (`bpmnDiffPane` or `dmnDiffPane`), so a
pane cannot be handed a panel flag it would ignore; only the DMN surface reaches
the HTML. On top of the BPMN pane's viewport and cursor, its partner follows the
view the user opens and the table's scroll. Its messages sit in
`libs/shared/src/lib/dmnDiffMessages.ts`, a feature file like the add-ons
view's. The bridge registers the surface as absent, because IntelliJ has no
DMN editor.

The DMN and Form editors, the element-template editor, the deployment
sidebar and the add-ons view have closed lists of their own
(`dmnEditorCommands.ts`, `formEditorCommands.ts`, `templateEditorCommands.ts`,
`deploymentSidebarCommands.ts`, `addOnsViewCommands.ts`), and each of these pages narrows its host
channel to its list, so a page cannot post a command of another surface.
`WEBVIEW_SURFACE_COMMAND_TYPES` (`libs/shared/src/lib/webviewSurfaces.ts`)
registers every surface with its list; the BPMN diff pane's entry is the
handshake plus the pane list, the DMN diff pane's its list alone. A spec in
`libs/shared` fails when a protocol command is on no surface, so a command no
webview posts is deleted, not kept routed. A
command may be on several surfaces: the log commands and the document sync
are. A repo-level spec ties the lists to the code: it type-checks each
workspace's `tsconfig.app.json` program, keeps those that construct
`HostApiImpl` (`libs/shared/src/lib/host.ts`, the one class that calls
`acquireVsCodeApi()`), so a webview counts whatever its directory is called
(#2218), and in each finds every
construction of a `Command` subclass in a workspace source of that program, its
libraries included, by base type rather than by name. A construction whose
`type` is not a string literal, or whose type is on no surface, fails with its
`path:line`. A new surface therefore registers in
`WEBVIEW_SURFACE_COMMAND_TYPES` before its webview can post anything. The scan
misses a message posted without a construction, such as an object literal or a
command the page echoes back, a webview whose program is not a
`tsconfig.app.json`, and a webview whose program never constructs
`HostApiImpl`, such as one that calls `acquireVsCodeApi()` itself or only
uses a mock. Such a webview drops out without a sign; the spec fails only when
no webview is left. The anchor class is resolved like the `Command` base: a
renamed class fails the spec, a moved one leaves no webview and fails it as
well. Building the three app programs that are no webview (the VS Code host,
the bridge, the Orca plugin) takes the spec file from 3.2 s to 7.1 s; the
manifest dependency `@types/vscode-webview`, which today only the webviews and
`libs/shared` declare, would cost nothing but misses a webview that gets its
types through `libs/shared`.

The deployment sidebar's commands reach the core's `DeploymentMessageDispatcher`
through a `CommandTable` over its list, as the editor's and the diff pane's do;
its log rows share `routeWebviewLogCommand`. `DeploymentFeature.panelRoutes`
reads that table before any panel attaches.

The add-ons view (`apps/add-ons-webview`, surface `addOnsView`) follows the
same shape. Its messages sit in `libs/shared/src/lib/addOnsView.ts`, a
feature file of their own, which both shared protocol specs import; its
payloads copy the core's catalog model, request, result and reveal (rows or
needs review) field for field, and `AddOnViewMessages.spec.ts` pins each whole type and each value set
to its home with `expectTypeOf`. `AddOnViewMessages` in the core's
`addOns/adapter/in/` maps the protocol for one page, so no host translates
it, and `AddOnsFeature.panelRoutes` reads its table before any page attaches.
The page asks for the last model when it loads (`GetAddOnCatalogCommand`), as
a host can drop a push that lands before the page listens. A request from the
page is untrusted: `addOnRequestOf` keeps only a kind the core knows with the
fields it names. The model holds workspace text (file, template and folder
names), so the page builds its DOM with the DOM API from the model and never
with `innerHTML`. VS Code serves the surface, and IntelliJ through the bridge.

The add-ons view wears the Miragon brand look, not the host's: it is
Miragon's own product surface, and one look serves both hosts. Its tokens
switch on `<html data-cd-theme="light|dark">` and `data-cd-kontrast="hoch"`,
never on IDE colours. The host only signals the mode and is its only writer. One rule,
`brandModeOf` in `libs/shared/src/lib/brandMode.ts`, maps the IDE theme
(light, dark, high contrast, high contrast light) and the `colorTheme` setting
to it: `automatic` follows the IDE, `light` forces light, and high contrast
always passes through. `brandModeAttributes` names the attributes. Each host
writes them into the shell it serves, `data-cd-theme` always, so the first
frame paints in the mode. On a change VS Code posts a `BrandModeQuery`, which
the page's router hands to `applyBrandMode` outside the view state, and
IntelliJ sets both attributes through `executeJavaScript`. IntelliJ's copy,
`BrandMode.kt`, runs `brandMode.cases.json` in `BrandModeTest`.

The page is a list beside a detail pane. Two tabs split the catalog by the
group's `kind`, the workspace's folders and the marketplaces; inside a tab a
search and filter chips narrow the list, grouped by folder and source, and the
detail shows the selected add-on with its actions as buttons. From 640px of
the view's own width the panes stand side by side, below that the detail
replaces the list with a Back button; container queries decide, so the layout
follows a resized sidebar or tool window without a reload. The reducer
(`src/domain/viewState.ts`) holds the tab, each tab's selection, the filter
and the pane, and keeps the tab the user chose (`chosenScope`), the selections
and the open or closed headers in the host's saved state, so a reload, which
IntelliJ does after a bridge restart, lands where the user was; the search
stays with the page. Until the user chooses a tab, the first model that lists
something opens Marketplaces when the Workspace tab lists nothing and a
marketplace is listed, else Workspace (`openingScopeOf`). A tab selects on its
own only a row its open headers show (`rowsInSight`). A search or
filter opens every header with a match, and what the user opens or closes
while it is on goes into `filterExpansion`, which stays with the page and ends
with the filter, so the saved headers never change while filtering and show
again once it is cleared.

The brand's own components draw it: the vendored tokens
(`cd-tokens.generated.css`, unchanged from the `miragon-brand` skill), Geist
and Geist Mono from `@fontsource-variable` and Lucide icons, all in the bundle
and tree-shaken; components use the `--cd-ui-*` roles and the palette only
for button, badge and kind surfaces. The stylesheet reads no `--vscode-*`
variable, and its spec checks that, the tokens' checksum, `[hidden]`, forced
colours and reduced motion. The type sizes are the brand's (13px base, 11px
small), so the IDE's font size does not reach the page; the host's zoom
still scales it. The fonts are OFL-1.1 and Lucide is ISC, so both plugins
carry their licenses. The add-ons build emits them beside the bundle
(`licenses/`), so a host job needs no install of the webview's dependencies:
`apps/vscode-plugin/webpack.config.js` copies them into the VSIX's
`licenses/` with the bundle, and the IntelliJ build's
`copyThirdPartyLicenses` puts them into the jar's `META-INF/licenses/`,
which `verifyReleaseBundles` checks for a release.

Every control is reached with Tab, and the list has no roving tree (see
[Alternatives](#alternatives-and-consequences)). The tabs keep the arrow,
Home and End keys of the tab pattern and the "…" menus those of the menu
pattern, with Escape back to their button and Tab on from it, as a role
promises its keys. When the host focuses the page (VS Code's view focus,
IntelliJ's tool window activation), focus goes to the selected add-on, its row or, in the
drill-down, its detail heading, else to the active tab. The view's own words,
its tab, chip and empty-state labels, "Needs review" and "Problem" on a row,
the hint of an empty detail and its screen-reader summaries, live in one
module, `src/domain/chromeTexts.ts`: they name the view's controls and
summaries, which the core's model does not have, as "Loading…" does, and one
module keeps them from scattering into adapters where a reviewer cannot tell
them from model text. A row's "Needs review" is read from what the core
offers (Allow), never from a rule of its own, and the detail shows
the core's state text. Every other text comes from the core, which also sends
`emptyText`, why no folder lists an add-on, whenever the workspace has none,
marketplaces or not.

IntelliJ shows the add-ons view as the **Add-ons** tab of its BPMN Modeler
tool window, next to the **Deploy** tab, as VS Code holds Deploy and Add-ons
in one container. The tool window keeps the id of the former deployment tool
window (`Miragon Deployment`), so a layout a user saved still applies; its
factory sets the stripe title. Each tab is one `JcefRelayPanel`, a JCEF page
that relays its messages verbatim, and counts as open only while the tool
window is visible and the tab selected (`VisibilityLatch`), so Deploy refreshes
its form defaults only while its tab shows. The Add-ons browser is built the
first time its tab shows, since each browser costs a renderer. Its shell
(`/addOns.html`, bundle under `/webview-add-ons/`) maps no IDE colour or font,
as the page wears the Miragon brand: it carries only the brand mode on
`<html>`, and the tab's theme script (`addOnsApplyJs`) sets it again on a LaF or
modeler settings change. The Deploy shell keeps its `#ide-theme-vars` palette
and has no brand mode. High Contrast
is the bundled theme's id, as 2024.2 has no API for it. The bridge attaches one panel, hidden,
at start. **Review…** reaches it through `RpcAddOnViewReveal`, the second
adapter of `AddOnViewRevealPort`: `addOns/reveal` asks Kotlin to select the tab
and activate the tool window, and the core then delivers the rows through the
panel, so no row id rides the wire. Kotlin answers `false` where JCEF is
missing, the tool window is not registered or the project is closing, and the
`ListReview` fallback asks instead. The Tools action **Review Add-ons**
(`ReviewAddOnsAction`) selects the tab itself through `revealAddOns`, then
sends `addOns/review`, a reliable, coalesced notification that starts the
bridge; the core then reveals what needs review through the panel. Where the
tab cannot show, it asks the core nothing. The tab's title button sends
`addOns/refresh`, as nothing reports an installed package or another window's
approval. Every process after the first, a crash respawn or a start after the
supervisor gave up, reloads the page: only a result frees a busy row, and a
request the dead process took would leave its row busy.

Each host keeps one coverage spec
over every surface, typed `HostSurfaceCoverage` (`libs/modeler-core/src/testing/`):
per surface a `Record` of every listed command to `HANDLED` or
`ignored(reason)`, or `absent(reason)` for a surface the host does not offer, as
IntelliJ does for the DMN and Form editors and for the element-template page,
which it answers itself. A new surface or a new command on a
list fails to compile until every host's table names it. The spec reads the
routes the host's composition builds (`createBridge`'s `surfaceRoutes` in
`apps/modeler-bridge/src/bridge.surfaceCoverage.spec.ts`, the VS Code features
in `apps/vscode-plugin/src/composition/webviewSurfaceCoverage.spec.ts`) and
compares them in full, ignore reasons included, and a surface is absent exactly
when the host has no routes for it. A host's router still
dispatches an unrouted type as a no-op, but records a type it drops on purpose
with `ignore(type, reason)`, once and with a non-blank reason. `routeOf(type)`
reports a type as handled, ignored with that reason, or unrouted, and a type is
never both handled and ignored, so a coverage spec can tell a deliberate drop
from a missing route.

Commands and Queries are not correlated by default: a request is a Command and
the answer a later pushed Query. A webview port that answers a query while
several requests can be in flight carries a request id that the host echoes,
as `SearchWorkspaceDefinitionsCommand` and `WorkspaceDefinitionsQuery` do.
Hosts answer an awaited request even when they cannot serve it, with an empty
or `failed` answer, as the clipboard reads and the definition search do. The
BPMN and DMN webviews still bound every awaited answer (`HOST_REPLY_TIMEOUT_MS`,
`createReplyRegistry` in `libs/shared`) because IntelliJ's
[best-effort frames](#process-lifecycle) can lose a request or its answer, and
treat a missed deadline as no answer. Only their initial file request waits
without a bound, since a cold first open can outlast any backstop.

Enforcement lives in the [core architecture tests](../../libs/modeler-core/src/architecture.spec.ts),
[VS Code architecture tests](../../apps/vscode-plugin/src/architecture.spec.ts),
[BPMN package tests](../../packages/bpmn-modeler/src/architecture.spec.ts),
[DMN package tests](../../packages/dmn-modeler/src/architecture.spec.ts),
the [repo-level tests](../../tools/repo-checks/src/architecture.spec.ts) (no
import cycles, stable dependencies and the
[role-folder rules](#workspace-kinds-and-role-folders) in every workspace), the
[webview command scan](../../tools/repo-checks/src/webviewCommands.spec.ts), and
[ESLint boundary rules](../../eslint.config.cjs). The specs share one
[engine](engineering-practices.md#architecture-tests).

### Workspace kinds and role folders

A fitness function reads folders, imports and types, never a file or type
name. A folder therefore states the role a file is meant to have, and its
imports show the role it has. Each workspace declares its kind once, in the
`"architecture"` field of its `package.json`, which `readWorkspaces` reads:

| Kind | Workspaces |
| --- | --- |
| `hexagonal` | `libs/modeler-core`, `apps/vscode-plugin`, `apps/modeler-bridge`, the five webviews, the template builder, `apps/orca-plugin`, `tools/repo-checks` |
| `diagram-js` | the diagram-js feature libraries in `libs/` and `packages/bpmn-modeler`, `packages/dmn-modeler`, which follow the bpmn-js module layout |
| `flat` | `modeler-types`, `shared`, `bpmn-diff`, `dmn-diff`, `bpmn-i18n-extras`, `standalone-extension`, `tools/architecture-testing`, `docs`, `apps/standalone` |

Every webview (#2129) and the template builder (#2130) sit in their role
folders.

In a `hexagonal` workspace the first role folder in a file's path is its role,
and the path before it is its context, so `modeler/bpmn/service/x.ts` sits in
`service/` of `modeler/bpmn` with no special case for nested contexts. The
layout below a role folder is free.

| Folder | Holds |
| --- | --- |
| `domain/` | rules as pure functions and values |
| `port/` | types only: interfaces the services and inbound adapters call, which outbound adapters implement (driven ports) |
| `service/` | orchestration, including the core's editor-session participants |
| `adapter/in/` | calls into the workspace: commands, webview and RPC message handlers, UI |
| `adapter/out/` | implementations of a port: VS Code, Node, HTTP clients |
| `composition/` | wiring: at the workspace root in a host, `<context>/composition/` in the core |
| `testing/` | the test kit |

A file directly in `src/` is an entry (`index.ts`, `main.ts`, `server.ts`);
that is a folder depth, not a name. Technology gets no role folder; it shows in
the imports. Every rule below blocks, because each is static: rules 1 to 9 read
only folders and imports, rule 10 the top-level statements of a `port/` file:

1. Every file sits in a role folder or is an entry.
2. `domain/` imports only `domain/`, so the domain decides and does not call
   out through a port.
3. `port/` imports only `domain/` and `port/`.
4. `service/` imports no `adapter/`, `composition/`, `testing/` or entry.
5. Only `adapter/in/`, `service/`, `composition/`, `testing/` and entries
   import a service, so `adapter/out/` never does. An entry may re-export one:
   the core's barrel is how hosts reach its services.
6. `adapter/in/` and `adapter/out/` never import each other, in any context.
7. Only `adapter/`, `composition/` and entries import a host module
   (`isHostModule`: `vscode`, `node:*`, `fs`, `http`).
8. Only `composition/` and entries import `composition/`.
9. Only `testing/` imports `testing/`, and nothing imports an entry.
10. A `port/` file declares only types: `import … from` with an import
    clause, interfaces, type aliases and type-only exports. A `const`, `let`
    or `var`, function, class, enum, namespace, `export default`, `export =`,
    value export, `export *`, side-effect import or export, `import … =` or
    any other statement fails. The check reads syntax and resolves no
    re-export, so a re-exported interface says `export type`.

Rule 10 is not an entry of `HEXAGONAL_RULES`: an `ArchitectureRule` sees only
the import graph, and `convention-coverage` reads every entry as an import
rule. A factory is a function type, so it stays a port
(`RepositorySourceFactory`). An interfaces-only rule would move the webview
channel types below out of `port/`.

A `diagram-js` or `flat` workspace holds no role folder, so no folder there
reads as a role nothing checks. Package imports stay out of the shared set:
the core's domain allowlist (`@miragon/bpmn-modeler-types`, `path`) and its
rules on contexts remain rules of the core's own spec.

Rule 6 follows `adapters.dontDependOnEachOther` in Hombergs' buckpal, at the
level of the direction rather than of each adapter package: here one
technology spans contexts, and the rules between contexts stay per workspace.

The core's session participants are in-core reactions that
`EditorSessionLifecycle` drives, so they sit in `service/`, which the core
always treated as one application layer with them. Webviews
follow the same roles: the UI, its markup and the router for the host's
queries are `adapter/in/`, the host channel and the modeler-library wrappers
`adapter/out/`, the reducers and pure rules `domain/`, and the bootstrap
`composition/`; `main.ts` stays the entry. A stylesheet sits next to the
module that imports it. The host channel's type and the state it persists are
`port/`, so the UI and the host adapter share them without importing each
other. A document session that keeps the modeler in sync with the host
through injected handles is `service/` (the DMN webview's
`DmnDocumentSession`, the BPMN webview's `BpmnDocumentSession`).

The BPMN webview splits its adapters on the live surface by direction: the
host's requests on the surface, the mode strip and the binding of a surface's
events to the session are `adapter/in/`; the modules that implement the
modeler library's ports over the host channel (capabilities, clipboard,
linting, the form preview) or wrap the library (surface factories and
modules, the document I/O of the live surface) are `adapter/out/`. The ports
the document session calls, such as `BpmnDocumentSurface`, are `port/`, so
the surface's document adapter implements one without importing the service.
The view-state manager and the process-variable publisher sync with the host
through injected handles like the document session, so they are `service/`.
The surface binding builds the manager's state store and the properties
panel's DOM adapter and hands them in, so the manager touches no DOM.
The template editor is a context of its own, `templateEditor/`, with the same
roles and its own entry, `templateEditorMain.ts`.

The bridge serves the host's RPC through handler tables in
`<context>/adapter/in/` (`editorSessionHandlers`, `deploymentHandlers`, …),
plain maps from method to handler that `composition/bindHandlers` binds to the
`Rpc` peer, so no handler imports the transport. The out adapters that mirror
host state (`BridgeSettings`, `NodeWorkspace`'s roots, `RpcDeploymentState`,
`RpcEditorHandle`, `BridgeScriptEditor`'s tabs) implement a port the handlers
take (`HostSettingsMirror`, `WorkspaceRoots`, `DeploymentStateMirror`,
`HostEditorHandleFactory`, `ScriptTabEvents`), so a handler keeps its order
against the core, such as applying the settings snapshot before a session's
participants run. `DocumentMirror` is plain state both directions use, so it
sits in `editorSession/domain/`, and the wire protocol, which both directions
speak, in `protocol/domain/`.

[`tools/repo-checks`](../../tools/repo-checks/src/architecture.spec.ts)
applies each kind's rules (`RULES_BY_KIND`) to every workspace that declares
it. A `hexagonal` workspace not yet moved into its role folders carries one
blanket `KnownException` (`from: <dir>, to: "*"`) naming the issue that moves
it; the stale-exception check removes it once the workspace passes. The
`convention-coverage` fitness function runs the same rules without exceptions,
so it reports what the list excuses as remaining work. The ESLint override that bans an empty
function in an adapter (#2053) covers `**/src/**/adapter/**/*.ts`.

### Host integrations

VS Code runs the core in-process. The standalone app loads that extension in
Theia/Electron and adds shell behavior through `libs/standalone-extension`.
IntelliJ runs the same core out-of-process and renders its BPMN editor in JCEF.
Its host also integrates diff, deployment, the add-ons view and scripting; its visual editor does
not currently provide DMN or Forms parity, nor the element-template editor.

[Orca](https://www.onorca.dev) hosts the two npm packages without the core.
`apps/orca-plugin` is one Orca plugin (`bpmn-modeler`) with a custom editor for
`.bpmn` and one for `.dmn`, each an isolated, sandboxed frame without a worker,
network or file access. The plugin is for seeing what an agent writes and
modeling lightly, so it composes `@miragon/bpmn-modeler` (the mode session with
View, Design and Implement, the properties panel, token simulation and in-page
linting) and `@miragon/dmn-modeler` directly instead of running a webview: a
webview needs the host protocol and the Node core, which a frame cannot run.
Every capability port stays empty, so code links, navigation, definition
search, form preview, scripting, workspace element templates and deployment do
not appear. Orca's document session is the document authority. One service,
[`syncDocument`](../../apps/orca-plugin/src/service/documentSync.ts), sits
between a `DocumentSession` port (Orca) and a `ModelCanvas` port (either
modeler): imports run one at a time, an edit's export is sent only while no
newer import replaced its source, and Orca's `editor.flush` applies input the
properties panel or a table cell still holds back before a save. It replaces
the shell's `connectOrcaDocumentSync`, whose export is synchronous, which has
no hook before a save, and which starts the first import before the caller
knows whether the tab is read-only. A read-only tab gets the BPMN viewer only;
the DMN modeler has no read-only mode, so its frame is inert. Orca denies the
clipboard permission, so copied elements stay in an in-frame clipboard. Orca
keeps no undo for custom editors; the canvas keeps its own.

A feature both hosts offer is built once in the core from ports, not wired per
host. `EditorSessionLifecycle` runs every editor session: it routes webview
messages in document order, tracks focus, and runs each
`EditorSessionParticipant` in isolation, so one failing participant cannot skip
the others or their teardown. Participants see focus, document, setting,
re-seed and dispose events, never a host panel. A hidden editor is no failure:
`EditorSessionStore.postUnlessHidden` keeps back what a webview asks for again
once it is shown, and reports `"hidden"` for what must be replayed. The host-free participants
(element templates, bpmnlint, settings, engine version, deployment status,
code-link, form-reference status, definition search, script editor) and the
webview message handlers live in the core. `DeploymentFeature` and
`MarketplaceCommands` own the deployment and marketplace flows.
`BpmnEditorFeature` (`modeler/bpmn/composition/`) builds the BPMN editor: its services, one
router from a `CommandTable` that has an entry for every type in
`BPMN_EDITOR_COMMAND_TYPES` (`WebviewMessageRouter.fromTable`), and its
participants in one order. The
cross-feature rule holds for it as for every feature, its `composition/`
included: navigation, definition search, code-link and the script
editor each export their handlers and participant as an `EditorContribution`
(`NavigationFeature`, `DefinitionSearchFeature`, `CodeLinkFeature`,
`ScriptEditorFeature`), and the host's composition hands them to the editor
with the deployment status participant. A feature that holds watchers or timers
has a `dispose()` the host calls on shutdown. A capability that differs between
hosts is a `BpmnEditorHostExtensions` entry, and an absent one makes the editor
ignore its commands with one reason. The three document commands
(`DOCUMENT_SYNC_COMMAND_TYPES`) form one such group: a host routes all of them
to the core's document services or the editor ignores all three, because a host
that routed `SyncDocumentCommand` without `DocumentFlushedCommand` would time
out every flush, so a save or deploy could miss the last debounced edit. A host
with its own document plumbing leaves `documentSync` out and answers the three
on its own channel. Both hosts run the feature from their
`composition/bpmnEditorFeature.ts`, so their routes and participant order are
the same, and each pins its routes in its surface coverage spec, with a row
that the document group is handled or ignored as a whole. VS Code supplies every
extension; the bridge leaves out the panel visibility.

A host supplies adapters and maps its own surface (VS Code commands and views,
bridge RPC) onto these modules. It keeps only what is genuinely host-specific:
the layout of the prompts the core builds, its own stores (VS Code's settings,
IntelliJ's application and project stores) and VS Code's reload hint; the
bridge's workspace-root registration and rendering on `document/didChange`,
because the host owns the document revision there. Host classes depend on the
core ports, not on concrete adapters, so the in-memory test kit fits every one
of them. Once a second adapter meets a port the core reads back from, the
port has one contract suite in the test kit that every adapter runs, the
in-memory fake included, as `describeWorkspaceContract` runs against
`InMemoryWorkspace`, `NodeWorkspace` and `VsCodeWorkspace`; a port that only
renders and a strategy the core chooses between need none. A port whose
methods return `void` but whose value the core reads back through another
port does not only render: it needs one whose fixture pairs it with that
reader. The
[`contract-suites`](engineering-practices.md#contract-suites) report lists the
adapters that run no suite of their port. Each host process builds one
`NodeInstalledPackages`, one `AllowanceLocator` and one `ContentRowMigration`
in its shared dependencies (`composition/sharedDeps.ts`): the plugins and the
rule packages get the same locator over that reader, and they and the add-ons
the same migration, so every feature locates an allowance the same way and waits
on the same run
([allowance per repository and add-on](bpmn-modeler.md#allowance-per-repository-and-add-on)).
Inbound
adapters never import outbound ones (rule 6 of the
[role folders](#workspace-kinds-and-role-folders)): a VS Code controller gets a
port (`ModelerPreferences`), a factory (`EditorHandleFactory`,
`DiffPaneFactory`) or a value (the extension URI, the nonce source) from the
composition root, and a helper both directions use is pure and sits in
`domain/` (`canonicalPath` reads only the parts of a `Uri`). A context of the
VS Code host reaches another only through `shared/`, which the VS Code
architecture test checks.

VS Code's side bar has one activity bar container, `bpmn-modeler-deploy`,
titled **BPMN Modeler** with the Miragon comet, the brand's sign for
Miragon itself (IntelliJ's tool window stripe shows it too); the rocket stays
on the deploy action. It kept the id of the
deployment-only container, so a user's layout survives. Theia stores a plugin
view container's title and icon in that layout and restores them over the ones
the extension contributes now, so the standalone app rebinds its
`PluginViewRegistry` in `libs/standalone-extension` to give a restored
container the current title and icon. The container holds two webview
views: **Deploy** (`bpmn-modeler.deploymentView`), shown while a custom editor
is open, and **Add-ons** (`bpmn-modeler.addOnsView`), shown whenever a
folder is open, so the container now shows whenever a folder is open. Both
set `retainContextWhenHidden`: the core posts nothing to a hidden view, so
keeping its page costs memory only, and a page shown again keeps its banners
and the results of requests in flight. The Add-ons view's shell
(`AddOnsViewHtml`, CSP shell `addOns`) allows its nonced script, its linked
stylesheet and the fonts its bundle ships, and no inline styles, as the page
uses no codicons, no images and no style attributes. The shell carries the
brand mode of `window.activeColorTheme` and the `colorTheme` setting
(`VsCodeBrandModeSignal`), and the provider posts a `BrandModeQuery` on each
change of either until the view is disposed, and again when the page asks for
its catalog, as a change posted while the page loads can be lost.
`AddOnsViewProvider` attaches one core panel per resolved view and hands it
the page's commands, its visibility and its disposal; the core refreshes on
show. The view's title bar **Refresh Add-ons** (`bpmn-modeler.refreshAddOns`)
is host chrome over `AddOnsFeature.refresh()`: no watcher covers
`node_modules`, so it is read again only then or when the view is shown again. Code names and
ids say `addOns`. **Review…** on a plugin or rule
package notice opens the view through `VsCodeAddOnsViewReveal`, the
`AddOnViewRevealPort` adapter: it has the provider focus the view, then asks
the core to reveal the rows, and answers `false` when focusing fails, as in a
shell without the command, so `ViewReview` falls back to the list. The
provider runs the view's `<viewId>.focus` command, which opens the container
and resolves the view; a page that is still loading then loses that focus, so
the provider shows the view with focus once more on the page's first message,
and the page focuses the revealed add-on, its row or, in the drill-down the
narrow side bar shows, its detail heading (the smoke test found a fresh view
left unfocused, with the row out of sight). A disposed view (hidden, moved or out
of its `when` clause) drops both the page state and an unanswered focus, so
the next view VS Code resolves starts clean. The reviews are built before the
BPMN editor that takes them, while the catalog is built later from that
editor's owners, so the composition connects the reveal once the catalog
exists; activation is synchronous, so no notice can ask before then. The
adapter runs `describeAddOnViewRevealContract`. The palette command
**Review Add-ons** (`bpmn-modeler.reviewAddOns`, `ReviewAddOnsCommand`) has
the provider focus the view the same way, then calls
`AddOnsFeature.revealNeedsReview()`; when focusing fails it only logs a
warning and asks the core nothing. It is offered while a folder is open, as
the view is.

The element-template editor is the main editor for template files in VS Code:
files in an `element-templates` folder open in it through a default editor
association, as `*.form` files open in the Form editor, and any other `.json`
file can be opened in it with **Open With…**. Its main area is the builder
(`@miragon/bpmn-modeler-element-template-builder`), a form over the template laid
out like VS Code's settings editor: a search, tabs for the template, its groups
and its properties, an index and the chosen item's settings. Because it is shown
inside the IDE, it is drawn with its own Preact components and coloured only by
the `--vscode-*` theme tokens, so it follows light, dark and high-contrast
themes; Light and Dark Modern values stand in where a host sets no tokens. The
properties panel the template produces sits on the right as a preview, and what
the official validator and the builder's own rules find docks under the form as
a lint-style summary whose list opens upwards without covering a field. The JSON
stays one toggle away beside it, where the host's own JSON support (`$schema`
IntelliSense, undo, diagnostics) applies.

The builder library is a `hexagonal` workspace: `domain/catalog/` is the
engines' data, the rest of `domain/` the rules over it as pure code, and
`adapter/in/` the UI that renders both. The repo-level role-folder rules hold
that direction; the library's own `architecture.spec.ts` adds what they do not
read: the catalog imports no rule and declares no function but `catalogFor`,
the domain names no DOM global, and only `adapter/in/` imports the panel's
Preact or a stylesheet. The catalog's conformance and coverage specs hold it to
the official schemas in both directions, so a schema bump fails until someone
decides what the builder does with a new binding. It depends on `jsonc-parser`,
because an edit must keep the file's formatting, comments and unknown keys, so
it changes the text rather than reprinting a parsed template, and on
`@bpmn-io/element-templates-validator`, so it does not restate the schemas.
Its Preact is the one `@bpmn-io/properties-panel` bundles, so the page ships no
second copy. `applyTemplateEdits` returns a result instead of throwing: valid JSON
that breaks the schema can make an edit impossible, and the page then writes
nothing and says where. Fields keep what was typed while it still means the file's
value, because the file only holds its normal form (`1` for `1.`). A template in
an array file is selected by its place in the file, since an edit can change its
id; a host's text can also move it, so that one is followed by id and version.
The page's state is one `EditorPage` value in the library's domain, with pure
transitions, which the page's bootstrap renders.

Its page is a second entry
of the BPMN webview bundle and parses the file itself: a host pushes the raw
text with the configured locale (`ElementTemplateFileQuery`) and later language
changes (`LanguageQuery`), so no host needs a bridge session for it. The page's
own edits go back like a modeler's: `SyncDocumentCommand`
with the document revision it was made on, a host revision that overtakes a
pending edit wins, and a save flushes the pending edit first.
`ElementTemplateEditorFeature` (`modeler/elementTemplate/`) builds the editor in
the core, like `BpmnEditorFeature`: its service, one router from a
`CommandTable` over `TEMPLATE_EDITOR_COMMAND_TYPES`, its participants and, because
the template store is not the modelers' store, its own `DocumentFlushService`
and `PendingEditsFlush` (serving `.json`). VS Code only adds the save-flush
controller and its commands. VS Code writes only the changed range of a document
(`minimalReplacement`, never splitting a CRLF or a surrogate pair), so the JSON
editor open beside keeps its cursor and undo restores one edit. In VS Code its custom editor has `option` priority on `*.json`,
so it never takes other JSON files over, and its sessions live in their own
`EditorSessionStore`: a template editor never becomes the target of modeler
commands or counts towards `bpmn-modeler.openCustomEditors`. The extension also
activates in workspaces that contain an `element-templates` folder, so a JSON
editor's title offers the template editor before any diagram is open.
`elementTemplateFolder` and `isElementTemplateFile` in `modeler-types` are the
one rule for where templates live and what counts as a template file, so a file
counts as a template only if it names a template schema or the loader reads it.
The manifest's `when` clause cannot read the config folder, so it leaves the
decision to a context key the extension sets, and IntelliJ's editor provider
keeps a Kotlin copy that runs the rules' `elementTemplateFile.cases.json` rows.
The default editor association cannot read it either, so it opens any folder of
that name; a file there that holds no template gets the start form or a note.

IntelliJ has no builder yet and shows the same page as a preview only: its
shell marks `#app` with `data-view="preview"`, so the page leaves out the
builder, the start form and the engine choice and never sends an edit. A
template's JSON opens in a `TextEditorWithPreview` holding the IDE's JSON editor
and the page, and the settings broadcast reaches it over an application
message-bus topic. Its provider builds the split editor directly, because the
platform's provider base class is experimental API on the 2024.2 floor. The page
therefore has two host wirings: the core's feature in VS Code, Kotlin in
IntelliJ. `elementTemplatePreviewMessages.cases.json` in `libs/shared` pins the
messages they exchange with the page to its message classes and lists the
commands it may post; IntelliJ's test reads the same rows, and a command it does
not know is logged as a warning. IntelliJ sends no document revision, since a
preview makes no edits to base on one.

A new template has one scaffold: `newTemplateText` in the builder library, with
its `id` and suggested name from `templateIdentity` beside it. VS Code's
**New Element Template** writes an empty file into
`<configFolder>/element-templates/` of a workspace folder and opens it in the
template editor, whose start form asks for the engine and the element type and
starts the name from the file name; until then the template loader reads the empty
file as holding no templates. IntelliJ has no command for it until it gets the
builder: a stub would be a second scaffold in Kotlin, and asking for the one in
TypeScript would take a new request type, since host-to-core methods on the bridge
are notifications today.

VS Code only downloads a JSON schema from a trusted domain, and unpkg is not a
default one. Its JSON client also trusts a URL an extension contributes through
`jsonValidation`, so the manifest contributes the two published template schema
URLs with an empty `fileMatch`: that trusts exactly those URLs and leaves the
user's `json.schemaDownload.trustedDomains` alone. It assigns them to no file,
because a template folder does not tell C7 from C8. This relies on how the
client works rather than on documented API, so the VS Code smoke test pins it,
with a version-pinned URL as the control that must still warn.

Inline scripts still open and sync their tabs per host, behind the core
`ScriptEditorPort` (`ScriptTaskService`, `BridgeScriptEditor`), because tab
handling is host API. What the webview's script commands mean is the core
`ScriptEditorFeature`'s on both: it stores the process variables the webview
extracts, writes a "Generate Script Files" batch one script at a time and names
its folder in the toast, logs a failed open with its element, resyncs after a
reload and tears an editor's scripts down on close. Both hosts read, write and
delete the script files through the core `ScriptFileStore`. It decides where a
diagram's scripts live: below the config folder of its workspace root, or in
the OS temp folder for a diagram that is not a file. A failed workspace lookup
rejects instead of moving the scripts to the temp folder, so no host writes
them somewhere the user did not configure. The store also owns the orphan
sweep, once per folder and process, and the `.gitignore`, which it writes only
when there is none. Each host passes its OS temp folder in the path spelling
its workspace port answers, because VS Code compares `uri.path` values
(`/c:/…`) where the bridge compares `C:/…`. It also passes how it spells such a
path for the user, so a message names `c:\…` and not `/c:/…`.

An editor's focus is its handle's `isActive()`, read through
`EditorSessionStore.isFocused`. The status items every editor shares (engine
version, bpmnlint, deployment) show an editor's state only if it is focused
when the item is written. A ledger write or a
[target change](deployment.md#targets-and-credentials) refreshes the
deployment item for the focused editor (`refreshFocused`), not the editor it
acted on. Each item's participant hides it on blur and close, and
`StatusItemOwnership` decides only that hide. BPMN and Form participants share
one engine-version owner from VS Code's composition, so a late blur or close
from either format cannot hide the other's newly focused status. The BPMN-only
bridge keeps a default owner. Only BPMN sessions run the deployment and lint
participants, so `refreshFocused` hides the deployment item when no BPMN
editor is focused (a DMN or Form editor, or none) instead of showing an item
nothing would hide. The store's command target (`CommandTarget`, read as
`getActiveEditorId`) is the session focused last, not focus. It stays on a
diagram while a text editor or a sidebar has focus, because those are not
sessions. Only a session that opens while no session holds the target takes it
without focus. So in VS Code a diagram that resolves in a background group
never takes commands from the focused one, and a session that replaces another
under the same id in the background leaves the target where it is. When the
target's panel turns inactive, the target moves to the session that has
reported focus longest without blurring since, if any. A host focuses one
editor at a time, so focusing a session drops every other session's report,
and a target the host focused keeps the target when it blurs. The VS Code
handle counts a panel as active only while it is also visible
(`panel.active && panel.visible`), for `isActive()` and for the state its
view-state events report. Running the app with Theia 1.76 showed Theia
restoring a hidden tab as its active widget and reporting that panel active
after a restart. That run logged only `active`. Theia's source takes
`visible` from the widget (`!widget.isHidden`), so the same report should
mark the panel hidden; no restart run has confirmed that yet. The handle
reports such a panel as a blur: the hidden tab neither takes the target nor
counts as focused, and a target on it goes to the session that has reported
focus longest, if any. VS Code reports an
active panel as visible, so nothing changes there. Theia creates every
custom-editor panel active and visible, so in the standalone app a diagram
that resolves behind the focused one takes the target, and hands it back when
Theia blurs its panel. Theia does not always send that blur. It caches each
panel's view state, compares new states against that cache, and drops an
update for a panel that does not exist yet. A background tab restored behind
the focused one therefore keeps reporting active and visible until the user
activates and leaves it, and `isFocused` and `getFocusedEditorId` report it
focused. Such a panel can take the target through a blur hand-off only until
the host focuses a session. When Theia sends no view-state update for the
restored diagrams at all, the diagram registered last keeps the target, so
after a restart commands can still act on a hidden tab until the user
focuses a diagram. The visibility check cannot catch that case, because the
panel never learns that it is hidden. The hand-off also depends on the order
of Theia's reports, which, by Theia's source, covers every changed panel in
one pass in the order Theia created them. When the visible diagram reports
inactive before the hidden tab reports, the visible one blurs first, the
hidden tab's blur finds no session that reports focus, and the hidden tab
keeps the target. `VsCodeEditorHandle.spec.ts` pins that case as an expected
failure. The tab model does not close them: VS Code before 1.135 can leave a
background tab marked active in `window.tabGroups`, and Theia's tab model can
still be empty when restored panels register. Both cases stay open in #1972;
the cause is Theia's view-state cache starting hidden while its panels start
active and visible.
In VS Code only one panel is active at a time, so the target ends on the panel
VS Code activated whichever view-state event comes first, and the bridge blurs
only sessions that no longer hold the target. A
closed target goes back to the open editor that held it before, and to the
newest remaining editor only when none did, until the host reports the next
focused one. The bridge treats `session/register` as the focused tab, so
it marks the handle active before registering it, and it derives `isActive()`
from the target. After a bridge respawn the IntelliJ host re-registers every
session, then sends `session/setActive` for the first selected tab that is a
diagram, the focused window's first, so the session registered last does not
keep the target. With no diagram tab selected, it does.
Theia sets a webview's `active` from
`shell.activeWidget`, so in the standalone app focusing a sidebar view such as
the deployment sidebar blurs the editor, and the shared items hide while the
sidebar has focus. VS Code keeps the panel active.

Status items are published as views, not widget calls. `StatusBarPort` has
`show(slot, view)` and `hide(slot)` for four closed slots: element templates,
engine version, BPMNlint and deployment target. A `StatusView` carries the
text, an icon, a tone, a tooltip, a click action and a `transient` flag, each
from a closed union in `kernel/domain/statusView.ts`. The kernel owns only the
slots and the view shape, so it names no feature type; each feature builds its
slot's view. A host decides where a slot goes and how an icon, a tone and an
action look, nothing more. VS Code follows its
[status-bar guideline](https://code.visualstudio.com/api/ux-guidelines/status-bar):
workspace-wide status on the left (element templates, whose loads also run for
background diagrams), the focused diagram's state on the right (engine
version, BPMNlint, deployment target). A transient view hides itself after
3 s, and a later show or hide of its slot cancels that
([`VsCodeStatusBar.spec.ts`](../../apps/vscode-plugin/src/shared/adapter/out/VsCodeStatusBar.spec.ts)).
The bridge sends a slot as one `statusBar/update {slot, view}` frame, with
`view: null` to hide it. IntelliJ follows VS Code as far as its status bar
allows: one widget per slot, the same text and tooltip, the same 3 s rule, and
the same click actions (Change Engine Version, the lint toggle over
`linting/toggle`, the deployment menu). Its status bar has no left side, so all
four widgets sit on the right in VS Code's left-to-right order. A tone colours
only the `dot` icon; the other icons are IntelliJ's own. The protocol snapshot holds
only top-level keys, so `HostUiRouterTest` pins the view fields and
`StatusSlotPlacementTest` reads `statusView.ts` and fails when a slot, icon,
tone or action has no Kotlin counterpart; at runtime the router logs and drops
what it does not know. `statusBar/update` is the only status RPC, so a new
status needs a slot, its view function and one placement per host, and no new
port method, RPC or Kotlin handler. No host builds status text of its own.

Prompts follow the same split. `PickerPort` has four methods, `choose`,
`chooseMany`, `confirm` and `searchAndChoose`, and each takes a prompt the core
builds in full, typed in `kernel/domain/prompts.ts`: an id, a title, a
placeholder and items with a label, a description or a file path, an icon from
a closed union, and the value a pick returns. A dismissal is an answer (`undefined`, `[]` or `false`), so the
caller decides whether it cancels. `confirmation()` in
`kernel/domain/affectedItems.ts` summarises a confirmation's details, and both
hosts show every line. The core also orders a file list by the path VS Code
shows for it (`fileChoicesInWorkspaceOrder` in `kernel/domain/fileChoices.ts`,
over `relativeToWorkspace`), and both hosts keep the order a prompt gives, so
they list the files alike, and return the rows the user checked in that order,
whatever order they were checked in. Only the payload files stay nearest first,
as their lookup finds them. VS Code
shows a path relative to the workspace, filters on descriptions too, draws an
icon as its codicon and reveals the busy list of a search after 150 ms. The
bridge sends a choice over the existing `picker/show` request with the path as
its description and no icon, maps the chosen indices back to values, and
brackets a search with status-bar progress, so neither the protocol nor Kotlin
changes. IntelliJ's `HostPicker` shows a `choose` as a list popup and a
`chooseMany` as a `PickManyDialog`, one checkbox per item and OK. The test
kit's `ScriptedPicker` answers a prompt by its id, returns several values in the
prompt's order and fails a test whose answer the prompt does not offer, so the
prompts of one run carry distinct ids: each engine's version prompt has its
own. `describePickerContract` and `describeTokenPromptContract` hold the kit's
fakes and the adapters of both hosts to these rules. The new-model engine,
engine-version, migration-scope, script-language and cleanup prompts, the choice
among located files and every deployment prompt
(`deployment/domain/deploymentPrompts.ts`: the payload file, the active target,
the status-bar menu, the files to deploy, the additional files, and the
confirmations to delete a target and to approve a credential host) come from
the core. The deployment services search the workspace through
`WorkspacePort.findFiles` themselves and offer the found files through
`chooseMany`.

Engine-version prompt presentation has one kernel builder,
`engineVersionChoicePrompt`: it renders the canonical engine label and supplied
versions without sorting or adding defaults. BPMN and Form keep separate
catalogues and prompt ids in their thin `engineVersionPrompt` and
`formVersionPrompt` wrappers.

The core's `newModelFilePrompt` builders own the BPMN, DMN and Form creation
titles, filter labels, extensions and full default filenames. VS Code computes
the default URI from the first workspace folder and renders the native save
dialog; overwrite confirmation and appending a missing extension remain host
concerns. `newModelFilePrompt.spec.ts` and `CommandController.spec.ts` pin these
contents and cancellation behavior. IntelliJ creation titles, descriptions,
defaults and cancellation flow remain host-owned in `NewBpmnModelAction`,
`NewDmnModelAction` and `NewModelSupport`; their different defaults and empty-BPMN
creation behavior are not migrated here ([#2222](https://github.com/Miragon/bpmn-modeler/issues/2222)).

The modeler UI language command also uses `PickerPort`: `modelerSettings` owns
the pure `modelerLanguagePrompt` and `ModelerLanguageService`. The service reads
the authoritative `supportedModelerLanguages` catalogue from `bpmn-i18n-extras`
(a core dependency); the domain receives only its labels and locale values.
Both hosts render the same title, placeholder and ordered choices, even with no
editor open. `LanguagePreferencePort` writes only the selected locale and leaves
`SettingsPort` read-only. VS Code saves at User scope, even if a workspace
override has the same effective value. IntelliJ sends `modeler/changeLanguage`
as a notification, lazily starting the bridge; its generic `picker/show`
roundtrip stays unchanged. `settings/setLanguage` is a narrow Core→Host request
with a host-work deadline and null acknowledgement. Kotlin atomically updates
only the application language, pushes the settings to every running bridge and
native listener, then acknowledges; an unchanged language only acknowledges.
Neither host optimistically changes a settings mirror. The service logs success
only after persistence. The domain/service specs, bridge command specs and Kotlin
settings-router tests pin this boundary.

Optional BPMN contributions keep their command declarations in their owning
contexts. Exact type-equality assertions in `BpmnEditorFeature.spec.ts` pin the
navigation, script-editor and code-link producer contributions to the consumer,
including keys and handler signatures, without production cross-context imports.

A notification with actions follows the same split (proposed with the
[BPMN plugins](bpmn-modeler.md#user-supplied-plugins-proposed), released in
VS Code 1.21.0 and IntelliJ 1.16.0).
`NotifierPort` only shows text, and a `PickerPort` list is too heavy for a
yes-or-later question, so the kernel adds a generic port
(`ActionNotifierPort.offer(notice)` in `kernel/port/hostPorts.ts`). The core
builds the `ActionNotice` in full (`kernel/domain/actionNotice.ts`): an id, a
tone (`info` or `warning`), the message and the actions, each a label and the
value it returns. The host shows the message with one button per action and
returns the chosen value, or `undefined` when the user dismisses it; the
caller decides what a dismissal means. VS Code renders it with
`showInformationMessage` or `showWarningMessage`. IntelliJ shows a balloon
with one `NotificationAction` per label over `actionNotice/show`, which
answers the clicked label's index, and the bridge's `RpcActionNotifier` maps it
back to the value. A balloon closed with its X stays in the Notifications tool
window and can still be answered, as a VS Code notice stays in its centre; the
notice is dismissed once it expires there. The test kit's
fake answers a notice by its id, with a scripted action or a dismissal, as
`ScriptedPicker` answers a prompt.

The core also decides which folders a workspace listing leaves out.
`excludedDirsGlob` (`kernel/domain/excludedDirs.ts`) builds one exclude glob
from `EXCLUDED_DIRS` (`node_modules` and build output) and every folder whose
name starts with a dot, and every listing passes it to `findFiles`: the
definition index, code-link, Navigate, both deployment pickers and Migrate
All. A caller adds its own folders to the same brace group, as the additional
files add `element-templates` and the config folder. The exclude matches a
file's path below its workspace folder. VS Code hands it to ripgrep, and the
bridge walks with `readdir` and never reads a folder the exclude covers whole
(`coveredFolderRegExp`), so both hosts prune the same folders and list the
same files. Each host leaves a folder open inside another to its own search,
as VS Code's search excludes nested root folders, so a file is listed once:
the core does not dedupe `findFiles` results.
`testing/workspaceContract.ts` runs the same rows against the
in-memory workspace, the bridge adapter and `VsCodeWorkspace`. On both hosts
`findFiles` follows a symlinked folder, as ripgrep does under VS Code's
default `search.followSymlinks`. The bridge prunes an excluded name before it
follows a link, so a `node_modules` link is never read, does not follow a link
back to a folder the walk came through, and skips a link it cannot resolve.
These rows stay out of the workspace contract, as the in-memory workspace has
no link targets and `VsCodeWorkspace` only forwards to VS Code's search:
`nodeAdapters.spec.ts` pins the bridge, and `vscodeWorkspaceFake.spec.ts` the
fake the VS Code adapter's contract run uses. The core's fs-walk fallback and
`watchedChangeOf` skip the same folders, so a live update agrees with the
listing. Dot-folders are left out on every host because VS Code's ripgrep
searched them and the bridge's former `fs.glob` did not; none of these
listings needs a file in one, as element templates, targets, payloads and
code-link maps are read by path. The pickers offer every match with no cap.
The bridge's recursive watch leaves out the `EXCLUDED_DIRS` names and the
state folders of version control, build tools and IDEs, as
`isIgnoredWatchDirName` (`kernel/domain/excludedDirs.ts`) decides, so a large
repo stays within the OS watch budget and a name added to or removed from
`EXCLUDED_DIRS` changes the watch with it. Other dot-folders stay watched, because the
template and lint config watchers read the config folder.

One prompt stays outside `PickerPort`: the template marketplace asks for a
personal access token in a masked input, which a chooser cannot show. Its port
follows the same split. `TokenPromptPort.promptForToken` takes a `TokenPrompt`
that `tokenPromptFor` (`template-marketplace/domain/tokenPrompt.ts`) builds in
full from the host and why the session asks: a refused request, worded by
`AccessDenial`, or a source the marketplace declares private. The view holds
the title `Personal Access Token for <host>`, the prompt text,
`password: true`, and the host. The session stores the answer under that host
and the test kit's `ScriptedTokenPrompt` answers by it; no host shows it. No
service writes any of this text. VS Code renders the view in an input box that
stays open while the user leaves to create the token. The bridge sends the
title and the prompt over `tokenPrompt/show`, and IntelliJ shows them in its
password dialog. Both hosts return the answer as typed, and
the core (`enteredToken`) takes a blank answer for no token, so a blank token
is never stored and no host trims.

The template marketplace's add and remove flows run in the core's
`MarketplaceCommands` (`template-marketplace/service/`) on both hosts, which
build them with `createMarketplaceCommands` (`template-marketplace/composition/`)
together with the add-on catalog's `MarketplaceInventory` over the same instance, and
`template-marketplace/domain/marketplacePrompts.ts` builds all their text.
Removing is a choice: `marketplaceRemoval` returns the nothing-registered
message, or a `chooseMany` prompt whose items name each entry and the scopes
that hold it (`This project`, `All my projects`, or both, from
`marketplaceScopesText`, which the add-on catalog uses too), so it needed no
new port method. The add-on catalog removes one named entry instead:
`marketplaceRemovalConfirm` builds a confirm that names it and its scopes, or
says it is no longer registered, and the same queued body follows. Adding asks for free text and a scope together, which no
`PickerPort` method can, so it is a new kind of input:
`MarketplacePromptPort.promptForMarketplace` takes the `MarketplaceAddPrompt`
that `marketplaceAddPrompt` builds (title, prompt, placeholder, the scopes to
choose from with where each is saved, the current answer and, when the core
asks again, why it refused the location) and returns the location and scope as
entered, or `undefined`. The core checks the location with
`registrableLocation` (`parseMarketplaceUrl` after the `~` expansion) and asks
again with the refused entry until it can register one or the user cancels. The
prompt also carries that check as a function, `problemWith`. VS Code runs it in
its input box as the user types, so it never answers with a location the core
refuses; a function cannot cross the bridge, so IntelliJ relies on the core
asking again. Each host keeps its layout: VS Code asks in steps (an input box,
then a quick pick when there is a choice), IntelliJ in one form with a radio
button per scope, and the refusal under the location field when the core asks
again. Both show every scope with the core's label and "Saved in …"
description. The bridge sends the prompt without the function over
`marketplacePrompt/show`, and IntelliJ's `MarketplaceRouter` shows its
`AddMarketplaceDialog`. A command started again while its own question is open
asks nothing: on IntelliJ, two clicks while the bridge starts would otherwise
queue a second modal dialog behind the first.

Each host keeps its marketplace registrations behind
`MarketplaceRegistrationsPort`. `read` returns each scope's own list as the
host stores it, the scopes the host can write now with where it saves each,
and where a self-hosted marketplace is written by hand; `register` and
`unregister` write. Whether an add registers anything is the core's
`marketplaceAddOutcome`: this project fetches the entries of both lists, so an add
for this project changes nothing when either list holds the entry, and an add
for all projects only when the all-projects list does, so an entry of this
project can still be shared with all projects. The core decides on a read made
once the marketplace is fetched, as a removal may have run while the question
was open. An add that registers nothing still fetches, because the cache is per
workspace and only an add or an update fills it; the outcome then names every
scope whose list holds the entry, and `marketplaceAddNotice` says where the
entry is registered instead of that it was added. `register` only appends to
the scope's own list unless that list holds the entry; no host and not the test fake checks the other list. The core merges the lists with `registeredMarketplaces`
(`template-marketplace/domain/marketplaceRegistrations.ts`): each entry once,
matched by its fields, with every scope that holds it, all-projects entries
first as both hosts union them for the fetch. VS Code's `getMarketplaces`
unions its settings with the same function, and `withoutMarketplaceEntries`
matches a removal the same way. A write resolves only once `SettingsPort` reads the new list, so the prune
after a removal keeps exactly what is still registered: VS Code reads its
settings live, and IntelliJ pushes the new snapshot before it acks
`marketplaceState/save` or `marketplaceState/remove`; `marketplaceState/read`
reads its stores. The scope vocabulary (`project`, `allProjects`) has its one
home in the kernel, `PROJECT_SCOPES` in `kernel/domain/projectScopes.ts`, as the
template switches speak it too; the marketplace keeps `MARKETPLACE_SCOPES` and
`MarketplaceScope` as aliases of it. VS Code's settings adapter and Kotlin's
`ProjectScope` speak it too, the
latter held to the list by `ProjectScopeTest`. Where a scope is
saved differs per host, so it reaches the core as a typed `SettingsPlace`, a
file by its path segments or a settings page by the names that lead to it, and
the core words it: `Saved in .vscode/settings.json` (or the open
`.code-workspace` file, or `Settings ▸ Workspace` for a workspace not saved yet)
and `Saved in Settings ▸ User` on VS Code, `Saved in .idea/workspace.xml` and `Saved in Settings ▸ Tools
▸ Miragon BPMN Modeler ▸ Template Marketplaces` on IntelliJ. The
invalid-location message names a place for self-hosted hosts only where there
is one: VS Code's `settings.json`. IntelliJ's lists hold URL strings, which
cannot name a self-hosted host, so it reports none, and the result of
`marketplaceState/read` has no such field. VS Code's reload hint after
an in-place update, and the `not a registered configuration` match that
triggers it, stay in its `TemplateMarketplaceController`.
`describeMarketplaceRegistrationsContract` runs these rules against the test
fake, VS Code's adapter over its settings and the bridge's adapter over a
loopback that answers as `MarketplaceRouter` does. The places that loopback
names come from `intellijWritableScopes.json`, which `MarketplaceRouterTest`
holds `MarketplaceRouter` to (#2223).

Adapters render core prompt text, except for the remaining IntelliJ creation
prompts tracked in #2222. A new choice or confirmation needs a builder and
an id, and no new port method, RPC or Kotlin handler. A new kind of input, such
as the masked token or the marketplace's free-text location, needs its own port
method, RPC and Kotlin handler, as those two have.

Two kinds of text belong to the host and are written there: its chrome, such as
VS Code's "Reload Window" button, and messages about its own failure, such as
the bridge process dying (`ProcessSupervisor.kt`) or VS Code failing to open a
compare view. Outside the tracked IntelliJ creation exception, the core builds
every other user-visible text. The `host-text`
fitness function reports the texts host code writes
([Host text](engineering-practices.md#host-text)).

The BPMN, DMN and Form editors synchronize their document through one core
module, `EditorDocumentSync`: own-write echo suppression, revision-checked
syncs, and a single, snapshot-checked initialization of an empty file. A
webview reload cannot race it; a host edit at a newer revision supersedes it,
whichever host owns the revision. Each modeler service adds only its
document type (the empty content, BPMN's engine prompt, the query it posts),
and one `DocumentRenderParticipant` re-renders any of them on a host change.
Before a document is persisted, the core's `PendingEditsFlush` asks the
webview for the edits its sync debounce still holds and writes them through
the modeler service served for the file type; VS Code runs it on every save,
and both deploys of the open diagram (Deploy Diagram and the deployment
sidebar's Deploy) run it on both hosts before they save.
In the BPMN, DMN and Form webviews, a value that still waits in an editor's
input debounce counts as such an edit: a BPMN or DMN properties panel's
(600 ms), DMN text in the decision-table, literal-expression and
boxed-expression editors (300 ms), and every form-js editor input (300 ms). The
BPMN and DMN modeler packages and the Form webview replace those debounce
services with the flushable one from `modeler-types`
(`createFlushableDebounceInput`): it tracks its waiting calls, and a flush runs
them and the calls they debounce in turn; a call that fails does not hold back
the others. The webview's flush applies them before it exports, so the
persisted file holds the value the editor shows. The BPMN surfaces register it
as `debounceInput` through `libs/properties-panel`; the DMN modeler registers
its own instances, one for the DRD panel and one for the other views; the Form
webview registers one as form-js's `debounce` service, with form-js's 300 ms
delay. A BPMN mode switch that rebuilds the surface applies them before it
exports the diagram for the next surface, and the webview's `beforeDestroy`
posts the sync they scheduled, so both the next surface and the document get
the value.
A save IntelliJ starts itself (Ctrl+S, autosave, the save on switching to
another application) flushes in the Kotlin host instead. IntelliJ announces it
with `beforeAllDocumentsSaving` on the EDT, before it reads which Documents
are unsaved, and the core's flush would end in a `document/write` that waits
for that EDT. The host asks every open page with a non-destructive flush,
waits at most 250 ms for all replies of a project together, and writes each
export whose revision still matches into its Document, which the same save
then persists. A page that answers `clean` because its sync went out while
the host waited gets that sync written the same way, since its core write
would land after the save. The page stays editable and its sync stays armed,
so the core still gets the edit; the host reports that late write as a
change, see [document causation](#document-causation-and-session-identity). A
page that does not answer in time is saved as it is. The host numbers its
flushes down from -1 and the core up from 1: the page answers both on one
channel, and every reply also reaches the core, so neither may take the
other's reply or release the other's lock. On 2026.1 (checked on 2026.1.3),
switching away saves from a background thread, but the platform still
delivers the event on the EDT through `invokeAndWait` while the saving thread
holds no lock, so the host's write cannot deadlock it.
Accepted residual: a sync the page posted before the host asked, whose core
write has not reached the EDT yet, lands after the save; and a save of one
Document (`saveDocument`), which neither Ctrl+S nor autosave makes, does not
flush.
Before the standalone app shuts down or moves a diagram into or out of a
secondary window (which reloads the webview), the Theia frontend in
`libs/standalone-extension` flushes the page into Theia's text model itself,
past the core. Every `clean` and `host-updated` reply carries the revision the
page represents; the core and IntelliJ read a reply's revision only on a
`flushed` export, so the field is additive. The frontend writes a `flushed`
export, and nothing for `host-updated`. For `clean` or `unavailable` it falls
back to the last sync it saw, once the text model has not taken it within
500 ms, unless the reply's revision is newer than the sync's: the page has
then imported an outside change newer than the document its sync was made
against, and the host document already holds it. `decideFlushWrite` holds this rule. Accepted residual: a
`flushed` export that races a host update still on its way to the page is
written without a revision check; only a flush through the core's
`PendingEditsFlush` would close that.
On the webview side the BPMN and DMN webviews share `WebviewDocumentSync` in
`libs/shared` (host revisions, the serialized import queue, debounced host
import and outbound sync, the flush protocol); BPMN adds its engine reload and
deferred actions on top. The Form webview shares the revisions, flush lock and
serialized import, but keeps posting each change at once instead of
debouncing: its JSON export is synchronous and cheap.

The BPMN webview ships an `index.js` entry, one `index.css` and lazily loaded
`chunks/**` that resolve relative to the entry (`base: "./"`), so every host
serves the whole bundle directory. VS Code and the standalone app copy it into
the extension; IntelliJ syncs it into plugin resources and serves any path
below it from the loopback asset server.

Every BPMN, DMN, form, deployment and add-ons shell sends a
Content-Security-Policy with `default-src 'none'`, so injected markup cannot
run script with the host message channel. Each policy allows only what its
bundle needs:

- `script-src` allows the entry by nonce in VS Code and by `'self'` in
  IntelliJ. The VS Code BPMN and DMN shells also list `webview.cspSource`,
  because the chunk loader's modulepreload links carry no nonce; the form and
  deployment bundles are one script each, so the nonce alone covers them. No
  `'unsafe-eval'`: nothing in the bundles compiles strings at runtime.
- `style-src` keeps `'unsafe-inline'` in every editor and deployment shell:
  diagram-js, the properties panel and CodeMirror set style attributes and
  inject `<style>` elements without a nonce, and the deployment form's markup
  carries a style attribute. The add-ons shells have only their linked
  stylesheet and allow `style-src` from the bundle alone (`webview.cspSource`
  in VS Code, `'self'` in IntelliJ); the bundle writes no style attribute or
  `<style>` element. Its one CSSOM write, the sticky toolbar's height as `--av-sticky-top` on
  `<html>` for `scroll-padding-top`, is outside what `style-src` governs, and
  without it Tab in a narrow view focused rows beneath the toolbar.
- In the BPMN, DMN and form shells `img-src` allows `data:`, and for BPMN also
  `https:`, because element-template icons may be either. BPMN and DMN have no
  `connect-src`, so a copy-as-PNG of a remote `.svg` icon renders without that
  icon. `font-src` allows `data:` for the embedded fonts.
- The form shell also allows what form-js components load at runtime: `https:`
  images and iframes (`frame-src`), and document previews, which fetch files
  over `connect-src https:` and show them from `blob:` URLs (`img-src blob:`,
  and `object-src blob:` for a PDF's `<embed>`).
- VS Code's deployment shell allows only its script and its styles, because the
  deployment form loads no images or fonts. IntelliJ builds its deployment
  policy from the BPMN one without `https:` images.
- Both add-ons shells allow fonts from the bundle alone (`font-src` is
  `webview.cspSource` in VS Code, `'self'` in IntelliJ) and no images. The
  bundle builds with Vite `base: "./"`, so its stylesheet's `url()`s resolve
  next to `index.css` in both hosts.
- `base-uri` and `form-action` are `'none'` in every shell: `default-src` does
  not cover them, and no bundle needs a `<base>` or a native form submission.

VS Code and the standalone app set the policy as a `<meta>` tag, because Theia
injects its own unnonced scripts ahead of it, and limit `localResourceRoots` to
each webview's bundle directory. IntelliJ sends it as a response header from
`WebviewServer` and allows the inline `acquireVsCodeApi` shim by its SHA-256
hash. The `#ide-theme-vars` block of the editor and deployment shells is
computed per request and rewritten live, so it relies on `'unsafe-inline'`. Each host builds its policies in one place,
VS Code in `webviewContentSecurityPolicy.ts` and IntelliJ in
`WebviewContentSecurityPolicy.kt`: the directives every shell shares are written
once, and a shell lists only what its bundle adds, so a shell can neither drop
nor reopen `base-uri` or `form-action` on its own. A loader for user-supplied bpmn-io
plugins must widen these policies on purpose rather than depend on a gap in
them.

Camunda Forms use a dedicated form-js webview and `.form` custom editor inside
the existing VS Code extension. Forms share the modeling workflow, host
infrastructure and release lifecycle with BPMN/DMN. A separate form extension
would duplicate that infrastructure and require another installation; the
accepted cost is a larger extension for users who do not model forms.

Forms use the existing native `engineVersion` status slot and Change Engine
Version command, not webview selectors. Platform choices reuse the canonical
engine order and display names: Camunda 7, then Camunda 8. The independent Form
compatibility table offers Camunda 8 versions 8.10.0, 8.9.0 and 8.8.0, newest
first, and Camunda 7 version 7. Serialized platform names remain `Camunda Cloud`
and `Camunda Platform`. New Forms use the newest version from the Form table,
8.10.0; BPMN's registry and 8.9 default remain independent. Missing and unsupported
declarations remain visible and untouched until an explicit, complete choice.
Escape, incomplete or unsupported choices and an unchanged pair do not flush,
write or notify, even when the original snapshot has since become stale.

`EngineVersionSelectionService` dispatches the explicit editor id by the
authoritative document path, case-insensitively. Each host registers its
supported capabilities in composition: VS Code registers BPMN and Form; the
IntelliJ bridge registers only BPMN. Closed editors and unregistered formats
are quiet no-ops; hosts do not duplicate extension routing policy.

`FormEngineSelectionService` captures the session, host revision and engine
metadata before the two native pickers. It rejects session or host-revision changes, but
allows unrelated guarded visual syncs while either picker is open. It flushes
pending visual input destructively outside the editor queue, then checks the
session, revision and captured engine metadata against the flushed document.
The final queued write also checks that the flushed baseline text is still
current. It patches that source in the queue, advances the host
revision and reloads the editor, releasing the flush lock in `finally`. This
keeps pending input while rejecting old-revision exports. Host imports and
destructive flushes share an inert-lock group in the Form page; releasing the
flush cannot enable interaction while the replacement schema is importing.

The public `FormModelerService` remains the display and sync facade and shares
its single `EditorDocumentSync` with the selection use case, preserving echo
guards. Stale or refused selections report one informational retry message,
only while the captured editor session is still current. Closure, replacement
and a dropped queued callback stay silent. Unexpected failures notify only that
original session; otherwise they are logged. A confirmed write superseded before
rendering is not reported as a refusal.

A narrow `FormTextEdits` port keeps source editing separate from domain rules.
Its core output adapter depends on pinned `jsonc-parser` and applies only the
two metadata edits. The domain accepts plain JSON only; the adapter does not
repair invalid source. Whole-schema serialization through form-js would upgrade
unrelated schemaVersion 18 to 19 and normalize custom properties and formatting.
Metadata-only edits instead preserve that source and use the ordinary document
write for dirty tracking and undo, never an autosave. The accepted cost is one
small JSON editing dependency and a separate adapter rather than importing the
element-template builder's template-specific editing rules.

The contracts live in `formEngine.spec.ts`, `JsonFormTextEdits.spec.ts`,
`FormModelerService.selection.spec.ts` and `FormEngineStatusBarParticipant.spec.ts`
under `libs/modeler-core/src/modeler/form/`. The real form-js input harness and
VS Code smoke test cover re-import, visual editability and native persistence.

Form source-recovery messages live in the private, browser-safe
`shared/lib/formEditorMessages` module so the core service and Form page use
the same text without importing the core into the webview. The shared
engine-version tooltip lives in `kernel/domain/engineVersionStatus`; both
domain status builders import it without depending on each other's feature.

### Runtime and transport

Ship the IntelliJ bridge as a self-contained binary compiled with
`bun build --compile`. Users need neither Node nor Bun installed. The core's
dependencies work in that runtime, and one toolchain can cross-compile the
platform binaries. Webview assets ship alongside the executable in the plugin.
The [bridge build scripts](../../apps/modeler-bridge/package.json) and
[Gradle staging](../../apps/intellij-plugin/build.gradle.kts) define the current
platform matrix and distinguish local host-only from release staging.

A single NDJSON JSON-RPC duplex over subprocess stdio carries host-capability
calls and the webview relay. JCEF messages travel through `JBCefJSQuery` to the
JVM and then stdio; replies return through the JVM's JavaScript message relay.
The bridge embeds no HTTP/WebSocket server and opens no TCP port. The JVM's
separate loopback asset server serves static resources, not per-document state.

Keep protocol methods, parameter types and directions in the
[protocol descriptor](../../apps/modeler-bridge/src/protocol/domain/descriptor.ts).
Update its committed snapshot when the private wire contract changes; the
[contract tests](../../apps/modeler-bridge/src/protocol/domain/protocol.spec.ts) guard
descriptor/snapshot agreement. The IntelliJ
[handler coverage test](../../apps/intellij-plugin/src/test/kotlin/io/miragon/intellij/bpmn/bridge/ProtocolHandlerCoverageTest.kt)
reads that snapshot and registers the production `BridgeRouters`: each core→host
method needs exactly one Kotlin handler, and a handler for a method the core no
longer sends fails it. The host names a host→core method only through the
`HostToCoreMethod` enum, which `RpcChannel.notify` and `notifyRaw` take in
place of a string; the test holds its wire names equal to the snapshot's
host→core methods in both directions, so the host cannot send a method the core
does not handle. It also compares parameter and result keys. Each host→core
sender runs once, and its frame must carry the keys the snapshot lists; a
snapshot method that no sender drives fails it.
Each core→host handler reads its params before it acts, through `RpcParams`, so
the test lets every handler read without acting and fails on a key the snapshot
does not list. The registry seals the params once that read returns, so a handler
that reads in its action fails at once instead of hiding the key. A reply can only
carry an `RpcResult` class, whose property names are its keys; the test replies
once with each request's result class and compares its keys with the snapshot's.
The snapshot is an input of the Gradle test task and of the IntelliJ CI path
filter, so a TypeScript-only protocol change runs the test.

A request's `replyWait` says how long the core waits for the reply: `prompt`
and `syncedWrite` until the host answers, `hostWork` 120 s, and `hostShow`
10 s. `hostShow` is for `addOns/reveal`, where the host shows one of its
views: the approval question queue waits on the reveal, so a host stuck behind
a modal dialog would otherwise hold every later notice; once it passes, the
list appears instead. Kotlin counts the same deadline from the request's
arrival and shows no tab once it passed, so the user does not get both; it
holds its copy of the deadline to the one `protocol.json` lists. The relayed
page messages and visibility of the add-ons view (`addOns/webviewMessage`,
`addOns/open`) are reliable frames that wait for the next process, unlike the
best-effort deployment relay: only a result frees a busy row on the page, so a
dropped request would leave its row busy. `addOns/review` is reliable too, as
the user waits for its result across a cold start; its coalesce key
`addOns/review` keeps one of the presses made while the bridge is down.

### Process lifecycle

One project-scoped supervisor owns one bridge process, isolating failures and
teardown to the project. The stateless asset server is application-scoped.
Project startup now prewarms the bridge and JCEF when supported; process
creation also remains off the UI thread when an editor needs it directly.

On exit, the supervisor retries with backoff and limits repeated rapid crashes;
a stable run resets that budget. Recovery re-registers live sessions from the
authoritative IntelliJ Documents, replays render requests, focuses the
selected diagram tab again, and re-seeds deployment state. A tab that closes while recovery builds its register frame
gets a second `session/dispose` after that frame, so the new bridge keeps no
session for it. If the same file registers again inside that window, recovery
then sends the new tab's `session/register` again, so the last frame for the
editor id belongs to the open tab. Stdin EOF terminates the bridge; project
disposal and shutdown cleanup prevent orphan processes.

The replayed render re-imports the Document, and a sync the restart window
dropped never reached it. Recovery therefore first flushes each page with the
rule a tab close uses: a destructive `exportWhenEdited` flush, written into the
Document only while its revision still matches, and skipped while an external
host update is pending. A page cannot tell a dropped sync from a delivered one,
but it knows whether it was edited since it last imported a host document
(`HostDocumentRevisions`). An edited page exports even when its sync already
went out; a page nobody edited answers `clean`, so recovery never writes the
modeler's serialization over a diagram nobody touched. A Document that refuses
the write keeps its text, a page the host cannot post the flush into is
skipped, and the other pages still recover. Each reply resolves the flush whose
token it carries, so a tab close and a recovery that flush the same page at
once both get their answer. The page stays locked until a render reaches it,
or a timeout after the replay passes; only the recovery that posted the page's
last flush holds that lock. A crash
recovery with an edit to write waits for an open modal dialog to close before
it re-registers. Reload Modeler runs the same recovery against the running
bridge. This is host policy and stays in Kotlin; a shared render participant
must keep the flush before the replay.
Accepted residual: an edit in the page's import debounce after the unlock can
still be overwritten; the first render to reach the page unlocks it, so a
render already in flight or an overlapping recovery's replay can unlock it
before the last replay re-imports; and each replay clears the page's undo stack.

An asynchronous writer drains a soft-bounded outbound queue so editor and JCEF
threads never block on bridge stdin. Superseded document and host-state updates
coalesce; authoritative document updates remain reliable across backpressure
and writer replacement. Best-effort frames may be dropped. An RPC reply survives
backpressure but not its process: a respawned bridge numbers its requests from 1
again, so the host tags each request with the generation of the process that
sent it and drops the reply once that process is detached, also when the reply
is created after the respawn.

The host answers every core request exactly once: with its result, or with an
error when its handler throws, also when the handler leaves the reader thread
for the EDT or a background thread (`RpcChannel.replyFrom`, pinned by the
[channel tests](../../apps/intellij-plugin/src/test/kotlin/io/miragon/intellij/bpmn/bridge/RpcChannelTest.kt)).
How long the bridge's `Rpc.request` waits is data on each request in the
[protocol descriptor](../../apps/modeler-bridge/src/protocol/domain/descriptor.ts)
(`replyWait`). Host work, such as a save, a clipboard read or a secret, fails
after two minutes, so a reply the host never sends cannot hold the caller's
per-editor queue; the caller's own error handling runs. The limit is generous
because host work can queue behind a modal dialog or a keychain prompt. Prompts
wait for the user. A write the core keeps its own state in step with has no
deadline either, because giving up on a write the host still applies would
leave that state out of step with the host: `document/write` and
`deploymentState/save` update a bridge mirror only on their reply, a failed
`marketplaceState/save` drops the templates its add just fetched, and the prune
after `marketplaceState/remove` reads the list the host pushed before its
reply. Such a request holds its caller until the host answers.
`document/write` runs on the EDT, so a modal dialog delays it; the host answers
the others on its reader thread, which runs no work that waits for the user. `Rpc` fails every
outstanding and later request once its input ends; the stdio binding signals
the end of stdin and then exits the process.

The reader thread reads every frame of one bridge, so a handler that blocks it
holds every editor's relays, status updates and document requests behind it.
A PasswordSafe read can block until the user answers an OS keychain prompt, so
the host runs `secretStore/*` and `tokenStore/*` on one background thread per
project, never the EDT, and answers from there. A prompt then delays only the
credential requests queued behind it, also those of a bridge respawned while it
is open, and the single thread keeps a save ahead of the read that follows it
([`SecretStoreRouterTest`](../../apps/intellij-plugin/src/test/kotlin/io/miragon/intellij/bpmn/bridge/SecretStoreRouterTest.kt)).

Notifications and status indicators are native host UI backed by RPC ports.
The core writes the text of every notification, including the error balloon
that puts a `notifyError` context above the error's message
(`notifiedErrorToastText`), so the host shows that text and composes none of
its own. Secrets use IntelliJ PasswordSafe, an application-scoped store,
corresponding to VS Code SecretStorage. Target-specific credential namespacing
belongs to the [deployment record](deployment.md#targets-and-credentials).

### Host-replicated state

Synchronous core getters cannot wait for asynchronous RPC. The bridge therefore
keeps explicit local mirrors with these ownership rules:

| Mirror | Seed and updates | Writer of record |
| --- | --- | --- |
| Documents, keyed by editor | `session/register`, then `document/didChange` | Host Document; bridge writes are accepted by the host before its content becomes authoritative |
| Settings snapshot | Settings in `session/register`, then `settings/didChange` after a change and after each spawn, since a register queued before the spawn read them early and a push while it started was dropped | Host only; one shared snapshot fans changes out to editors |
| Deployment state | `deploymentState/seed` with what the host stored, then `deploymentState/save` patches | Host; a bridge patch reaches the snapshot only after the host accepted it |
| Plugin approvals (bpmn-js plugins and bpmnlint rule packages; each row is an allowance, `allowance-v1:<kind>`, or a 1.21.0 row pinned to content, and the protocol carries both unchanged) | `pluginApprovals` with `pluginApprovalsRevision` in `session/register`, then `pluginApprovals/didChange` with its `revision`, which every running bridge of the IDE gets after any `pluginApprovals/change` and each bridge after its spawn; `pluginApprovals/read` answers the stored list | Host (`PluginApprovalStore`, application level): a bridge sends only the rows to allow and the ids to revoke, and the host merges them under one lock and bumps the revision. The mirror keeps only a newer revision, the change's answer included |
| Workspace roots | `session/register`'s `workspaceRoot`, counted per session and released with it; `addOns/open`'s, claimed once per process, re-sent after every spawn and never released, so the add-ons view lists the project after its last editor closed. `addOns/open` carries the settings, as a register does, since one queued while the bridge was down reaches the new process before the spawn's `settings/didChange` | Host: `project.basePath` in IntelliJ, or the file's folder for a session without one; an `addOns/open` without it lists no folder |
| Template switches (element templates and their sources turned off per user) | `templatePreferences` in `session/register`: both scopes, each with its own `revision`. Then `templatePreferences/didChange` with both again, which every running bridge of the IDE gets after an `allProjects` change, only the project's own bridge after a `project` change, and each bridge after its spawn, since a register queued before the spawn read them early and a push while it started was dropped; `templatePreferences/read` answers both stored lists. The add-on catalog reads `readStored` for every listing, so it needs no seed; the editor reads the seeded mirror when it sends its templates | Host. IntelliJ: `ProjectTemplatePreferenceStore` (project `PropertiesComponent`, so `.idea/workspace.xml`, per user) for `project` and `TemplatePreferenceStore` (application `PropertiesComponent`) for `allProjects`, one key each. A bridge sends the switches to disable and to enable for one scope; the store of that scope merges them under its lock with the Kotlin `templatePreferencesAfter`, held to `templatePreferenceChange.cases.json`, and bumps its revision, and the host pushes before it answers. The mirror keeps only a newer revision per scope, the change's answer included. VS Code (`VsCodeTemplatePreferenceStore`): `workspaceState` for `project` and `globalState` for `allProjects`, on this machine only (no `setKeysForSync`), merged on a queue; another window's write arrives through `readStored` when the window gains focus |
| Workspace trust (whether the user trusts the project, so its plugins and rule packages may run) | `workspaceTrust` (`trusted`, `revision`) in `session/register`, then `workspaceTrust/didChange` with both after each spawn and whenever IntelliJ's `TrustedProjectsListener` announces a change of any project's trust, and before **Refresh** of the Add-ons tab, since adding a Trusted Location announces nothing. Untrusted until the first frame | Host: `Project.isTrusted()` (`com.intellij.ide.impl`), read with a new revision under one lock (`ProjectTrust`), so a newer revision never carries an older read. The mirror keeps only a newer revision and tells its listeners only when the value changes |

Apply settings before initial artifact discovery. Seed every synchronous mirror
before its first consumer, and re-seed on process restart; mirrors do not
survive the subprocess.

The IntelliJ host registers each mirror it owns once, as a `ReplicatedState`
(its `session/register` entries, its push to one bridge, and whether any of
its changes may reach every bridge) in the list `BridgeRouters.replicatedStates`.
The register frame, the seed after a spawn and the fan-out walk that list, and
`BridgeRoutersTest` fails on a router that mirrors a state outside it. The router
picks the reach of each change by its scope, such as a template switch for one
project or for all; the fan-out only refuses a state that is the project's own.

A mirror fed from more than one frame cannot rely on the host's send order.
The bridge runs each inbound call on a queue keyed by its editor or its method
(`Rpc.handleLine`), so a `session/register` waits behind its editor's earlier
frames while a later push on another queue runs at once, and a request's reply
can arrive after a newer push. The approvals therefore carry a host revision,
read together with the list, on every frame that carries a list, and the mirror
ignores an older one. The template switches do the same per scope: the two
scopes live in different stores, so one revision each, and a frame's older
scope never replaces a newer one while its newer scope still applies. The
workspace trust carries one revision per read too. The host holds no lock while it queues the frames and
does not coalesce them: two projects' changes queue from their own threads, so
a frame queued later can carry the older revision and must not replace the
newer one. The
revision lives in memory per IDE run, since every bridge is a child of that
run, and a respawned bridge starts below it.

Every host reads a setting the same way, as `normalizeSettings` in the core's
[`kernel/domain/modelerSettings.ts`](../../libs/modeler-core/src/kernel/domain/modelerSettings.ts)
decides: a blank config folder, an unknown theme or mode, or a value of the
wrong type reads as the default, and at most six favourites are pinned. Its
`DEFAULT_MODELER_SETTINGS` are the defaults the VS Code manifest declares.
VS Code parses each value as it reads it. The bridge normalises the host's
snapshot before it compares it with the current one, so a value that reads as
the current one fires no change. A setting change names its settings by the
closed `SettingKey` union, the keys VS Code stores below `miragon.bpmnModeler`
(`scripting.spin`, `linting.enabled`). One table in the same file maps each
snapshot key to its `SettingKey` (`settingKeyOf`), and the union is derived
from it. Core subscribers ask `affects(key)` the same way on every host:
VS Code adds the prefix to ask its own event, and the bridge names the keys
`changedSettingKeys` reports with `settingChangeNaming`. The VS Code adapter
reads, writes and watches settings only through `modelerConfiguration.ts`,
whose keys are typed `SettingKey`; its manifest contract spec fails on a
configuration call in any other file. IntelliJ's `ModelerSettingsStore` keeps a
Kotlin copy of the normalisation, because the IDE's Settings page stores and
shows the values without the bridge.
`settingsNormalization.cases.json` beside the rule holds the rows all three
hosts run (see [test-first for rules](engineering-practices.md#test-first-for-rules));
the Kotlin test also compares its defaults with the manifest's, its modes
with `SURFACE_MODES` and its colour themes with `COLOR_THEMES`, the sets the
core accepts. The manifest contract spec holds the manifest's `defaultMode` and
`colorTheme` choices to the same sets in both directions and requires a label
for each. The IntelliJ Settings page offers the manifest's
modes and labels in its order and labels each mode as the modeler's mode strip
does (`MODE_LABEL` in `modeStrip.ts`); its test reads both from the rendered
page. `apps/vscode-plugin` does not depend on `@miragon/bpmn-modeler`, so the
manifest's labels reach `MODE_LABEL` only through that Kotlin test.

The lint choice is a snapshot setting like the others, but the IntelliJ
Settings page has no field for it: the editor's lint toggle and the BPMNlint
widget drive it. The bridge never changes its copy. It reports a changed
choice to the host over `settings/setLintingEnabled`; the host stores it per
user in `PropertiesComponent` (application level) and pushes the snapshot to
every running bridge before it acks. The choice therefore holds across bridge
respawns, IDE restarts and open projects, as VS Code's User setting does. The
core compares the page's choice with the stored one on every host: an equal
choice is not stored, and the core pushes the lint state to the page again
instead, so a page out of step catches up.

Automatic form preview follows the same ownership: the host persists an
application-wide/User preference and distributes it through the existing settings
snapshot, without a preview-specific RPC. Initial and recovery settings must
arrive before selection restoration, so a surviving page cannot reopen an
automatic preview using a stale preference.

The deployment state is one `DeploymentState` snapshot in the core's
[`deployment/domain/deploymentState.ts`](../../libs/modeler-core/src/deployment/domain/deploymentState.ts):
the ad-hoc connection, the active target and the freshness ledger.
`DeploymentStatePort` has two methods, a synchronous `load()` and
`save(patch)`. A `DeploymentStatePatch` names the fields it writes and the
ledger rows it puts and removes, so a deploy's connection or a prune's rows
travel as one write. The core owns the defaults and the shape:
`deploymentStateFrom` reads a missing value or one of the wrong type as the
default and drops a ledger row that is not a revision, on both hosts. A host
stores a save all or nothing. VS Code keeps the whole snapshot under the one
workspace-state key `bpmn-modeler.deployment.state`, because an update of one
`Memento` key is its only atomic write; a key per field, written one after
another, would keep the keys written before a rejected write and so store a
connection in part. It reads the per-field keys earlier releases wrote until
the first save, and leaves them in place, so a downgraded release reads the
state as it was at the upgrade. IntelliJ seeds the bridge with the keys it has
stored, without defaults, and applies each patch in the one
`deploymentState/save` handler.

The bridge sends a patch as an acknowledged host request and applies it to
its snapshot only once the host accepted it, onto the snapshot as it is then,
so an overlapping save is kept. A rejected write rejects, as it does on
VS Code, and leaves the snapshot as it was: a read never shows a value the
host did not store, so the freshness indicator does not show a revision the
host never recorded. The cost is that `load()` returns the previous state
until the save resolves, so a core caller awaits a save before it reads what
the save wrote; `DeploymentStatePort.save` states this for every host. Whether
a failed write fails the operation is the core's decision, not the adapter's:
an engine-accepted deploy stays deployed (see
[deployment](deployment.md#saved-target-execution)).

A new synchronous port must specify its seed, respawn replay, writer, update
direction and any echo handling. Keep these explicit rather than forcing a
generic mirror abstraction across keyed documents, event-producing settings,
and patched deployment state.

### Document causation and session identity

The `document/write` reply is the causation signal for the bridge's own
writes; the host sends no `document/didChange` echo for them. While applying a
write, the host marks the editor so the synchronous Document listener skips
the change without copying the text. An accepted, changed reply updates the
bridge mirror and does not re-render. When the host normalizes line
separators, the reply carries `normalizedContent` so the mirror keeps the
host's exact bytes; otherwise the full XML is not sent back. Every
`document/didChange` is therefore external and re-renders. Content equality
alone is never used to classify a change. This relies on the host replying on
the same ordered channel after the Document mutation, so a later external
change always arrives after the reply.

A page sync's write never re-renders: the page already shows that content. A
core write of content the page did not produce (Change Engine Version, Migrate
All) is followed by an explicit render at the unchanged host revision. Migrate
All renders through `BpmnEditorFeature.renderCoreWrite`, which renders only for
`host-driven` rendering: on VS Code the write's change event already
re-renders. Accepted cost: a page sync sent before that render arrives carries
the same revision, so the host accepts it and it overwrites the core write.

A page flush the IntelliJ host writes itself (before a save, a close or a
re-render) bypasses the core, so the bridge mirror misses that content. The
host remembers it per session, and the next accepted write of the same content
reports `changed` although the Document already holds it, so the mirror takes
it. Every accepted write and every external change forget it, and a register
forgets it before it re-seeds the mirror from the Document.

Separately, the host advances `documentRevision` on external changes. Renders
carry it to the webview; writes return it as `expectedDocumentRevision`.
Reject stale writes with `accepted: false` and retain host content. Registration
re-seeds the revision so restart cannot reset this protection.

When the Document fails an edit, the host answers the write with an error. The
bridge reads that error reply as a refused write, so `DocumentPort.write`
answers `false` as on VS Code, and the mirror keeps its text. Accepted cost: on
both hosts a failed edit is not reported as such. The page sync shows nothing,
and Change Engine Version blames a change made while the user picked a version.

Host-owned `sessionId` distinguishes successive editors for the same URI. Both
peers reject mismatched identities, including stale disposal. For existing
compatibility, a missing session ID addresses the current session; legacy
webview writes without a document revision are accepted only before revision
zero advances. The core's own session guard remains a second defense.

### Shared host caches

A host process serves every open editor, so work whose result does not depend
on the editor is cached in the `modeler-core` service that every editor of the
process shares. Hosts only wire lifecycle events into that service. Each entry
has an owner that keeps it valid: a version key that changes with its input, or
a live watcher of an open editor. An entry is released with its last editor, and
a cached result must equal an uncached run.

- **Element templates.** `BpmnElementTemplatesService` caches parsed templates
  per template directory, plus the marketplace cache. The directories that exist
  are still probed per request, so a new `element-templates` folder is found.
  A template watcher event drops all directory entries once, after a short
  debounce over the per-editor watchers. A marketplace action drops the
  marketplace entry. Releasing an editor drops the directories no open editor
  still watches, because a change there would otherwise go unnoticed.
  Accepted cost: a marketplace update made by another window is not seen while
  editors of this process stay open.
- **BPMN plugin copies.** `BpmnPluginService` copies the bytes of an allowed plugin into
  a content-addressed folder on disk, which every process of the host shares
  (IntelliJ: one per machine; VS Code: the extension's global storage), and
  keeps each copy per process once written. Last use owns the folder: each
  copy holds a `last-used` marker that serving refreshes at most once a day,
  and `pruneIdleCopies`, run when a process starts, removes the copies no
  editor of this process is served whose marker is missing or 30 days old,
  without reading the approval list. Because another process can prune, a
  copy found in the memo is checked on disk and written again when it is
  gone. Accepted cost: a page that loads between another process's delete
  and that check leaves the plugin out once.
- **Escalated lint setup.** `NodeBpmnLinter` keeps the moddle, the loaded
  moddle extensions and the resolved rules and configs per `.bpmnlintrc` path,
  keyed by the config content and the rule package rows. A changed config or
  a changed row replaces the entry, and so does an admitted rule package whose
  `package.json` stamps differently; the new setup then evicts the cached
  modules within that package's `node_modules` (see
  [Workspace rule packages](bpmn-modeler.md#workspace-rule-packages)). Every run
  still builds its own `Linter`, as [Linting](bpmn-modeler.md#linting) requires.
  Rules no resolver finds, and setups with a missing moddle extension, are not
  kept, so installing the package takes effect on the next run. Accepted cost:
  a workspace plugin installed mid-session that shadows a bundled rule takes
  effect only after the config changes or the host restarts.
- **Code-link source index.** `SourceIndex` keeps, per set of workspace
  folders, the listed source files and each file's facts: the bean ids its
  Spring/CDI annotations name and its short quoted literals. A resolve then
  answers from map lookups instead of reading every source. The facts give the
  same answers as the content matchers for every literal they can decide,
  checked by a fuzz spec. A longer literal, or one with whitespace or quotes,
  is still matched against the content. One `**/*` watcher per folder keeps the
  index current at constant cost per event: a change drops one file's facts, a
  delete or an unknown create lists the folders again on the next resolve, and
  a folder created or deleted as a whole drops its files' facts then. Documents
  outside every folder are not indexed. Accepted costs: facts stay in memory
  while an editor of those folders is open (files over 1 MB are not kept), and
  changes the watchers miss, for example under `files.watcherExclude`, show
  only after the last such editor closes.

## Alternatives and consequences

- Hombergs nests `port/` and `service/` under `application/`. The flat
  variant keeps the same roles with one folder less per context, and no rule
  needs the grouping.
- Evans keeps repository interfaces in the domain (`domain/port/`). A role
  folder inside another makes the role ambiguous by path, and rule 2 needs
  `domain/` and `port/` apart, so `port/` is a sibling.
- `session/` as a role of its own would split one application layer in two
  without a rule that tells them apart.
- The test kit in `adapter/out/` would fit its fakes, but `createTestHost`
  wires services, which rule 5 forbids there, so `testing/` is a role.
- A central table of kinds in the repo-level spec would sit apart from the
  workspace it describes; a new workspace would pass until someone listed it.
  The manifest field travels with the workspace, and the spec fails on a
  missing or unknown kind.
- Detecting a port by its type (an interface a class in `adapter/out/`
  implements) would flag a correct helper there that implements none. The
  folder states the role; the `convention-coverage` fitness function reports
  a class implementing a port outside `adapter/out/` and `testing/`.
- One workspace-level composition for the core would exempt it from the rule
  that contexts meet only through `kernel/` and `editorSession/`. Wiring sits
  in `<context>/composition/`, where that rule still applies.
- Leaving the core or its registries inside the VS Code plugin would couple
  other hosts to plugin internals or force them to duplicate session logic.
- Enforcing a layer rule only once no violation remains would let new ones in
  meanwhile. A known exception lets the gate start first, at the cost of a list
  that review has to keep from growing.
- A separate library for the pure rules browser code shares with the core
  would need a manifest, path aliases, a Vitest target and entries in the
  inlined-library lists, about ten config edits for a few hundred lines. The
  rules live in `modeler-types` instead, at two costs: a `feat` or `fix` there
  triggers both npm release lines (see
  [Release and publishing](release-and-publishing.md)), and the core's
  [mutation run](engineering-practices.md#mutation-testing) does not cover
  them.
- `kernel/` and `editorSession/` could be workspaces of their own, which would
  turn their direction into package dependencies. That adds manifests, path
  aliases and Vitest targets for code no consumer imports apart from the core,
  so they stay folders whose import direction the core architecture test
  enforces.
- One port method per status item or prompt let each host build the text. The
  copies drifted (labels, plurals, summaries, tooltips), and every new item
  touched both adapters, the RPC and Kotlin. Core-built views and prompts cost
  the hosts per-item freedom: a host renders only what the shared shape
  carries, so a widget-specific touch needs a field in that shape first.
- The add-ons view could follow the IDE's look through VS Code's `--vscode-*`
  variables, with IntelliJ mapping its palette onto the same names. That
  needed a pinned list of every variable the stylesheet read, a Kotlin mapping
  held to it, `'unsafe-inline'` for the mapped block in IntelliJ's shell, and
  still looked different in each host. The brand look costs the view its
  match with the IDE's colours and font size; the host keeps only light, dark
  and high contrast.
- The core could send the view's own words (tab and chip labels, "Needs
  review", the empty and no-match texts) in the catalog model. They name
  controls and filters of one page, not the catalog, so each would be a
  protocol field no other view reads. Keeping them in `chromeTexts.ts` costs a
  second home for words beside the core's, so a review checks that a new word
  there names the view and does not restate a model text.
- The outline's roving tree kept the list one tab stop, with arrows, Home,
  End and type-ahead inside it. The list-and-detail layout of
  [#2321](https://github.com/Miragon/bpmn-modeler/issues/2321) puts each row's
  actions in the detail pane, and the product decision put that layout before
  the tree model. Dropping it costs keyboard users one Tab per shown row and
  header; closing a folder, the search and the chips shorten the way.
- The marketplace's free-text location could have come through a generic
  text-input port beside `TokenPromptPort`, with the scope through
  `PickerPort.choose`. That costs the same protocol as the add question (one
  port method, one RPC, one Kotlin handler) but splits IntelliJ's one form into
  two dialogs and the question into two prompts the core has to sequence. A
  text prompt with a `password` flag in place of `TokenPromptPort` adds no RPC,
  but changes `tokenPrompt/show` and its handler, makes `RpcChannel`'s log
  redaction depend on a flag instead of the method, and still splits the form.
  The add question costs one RPC for one flow; another free-text question will
  need its own method or a generalisation of this one.
- Checking the location only after the answer would cost VS Code its check as
  the user types and make it ask for the scope before saying the location is
  wrong. The `problemWith` function in the prompt is the check the core applies
  anyway, at the cost of a prompt that is not plain data: the bridge drops the
  function and IntelliJ learns of a refusal only when the core asks again.
- The hosts worded where a scope is saved themselves, and the words drifted
  ("Saved in your user settings" against "Also shown in Settings ▸ Tools ▸
  Miragon BPMN Modeler"); IntelliJ's hint even sent self-hosted hosts to a
  settings page that accepts only URL strings. Wording both scopes alike
  without the place would drop what tells the user whether an entry lands in
  the repository or in their own settings. A typed `SettingsPlace` keeps that
  fact per host and the words in the core; a text from the host would be host
  prose again.
- IntelliJ could have piggybacked its registrations on `marketplace/add` and
  `marketplace/remove`, saving `marketplaceState/read`, but the bridge would
  need a mirror for them and a read would hang off a trigger.
- IntelliJ could show a `chooseMany` prompt in the list popup it uses for
  `choose`, with Ctrl- and Shift-click for several rows. A plain click or Enter
  chooses a popup row at once, so one stray click would remove a marketplace
  or deploy one file. `HostPicker` shows `chooseMany` as a `PickManyDialog`
  instead: a checkbox per item and OK, as IntelliJ's own remove dialog had
  before the core built the choice. OK with nothing checked is a cancel.
- `MarketplaceRegistrationsPort.read` could return the merged registrations
  with their scopes. Each host and the test fake then merged the lists
  themselves (one entry per structural key, its scopes, all-projects first):
  three copies in TypeScript and Kotlin that no test compared. Each scope's own
  list costs a host nothing and leaves one merge, in the core.
- Each host's `register` could keep deciding whether an add registers anything,
  as VS Code's settings adapter and IntelliJ's project store did. Those were two
  copies of the rule, and the test fake followed neither, so the core's specs
  pinned a behaviour no host had. Deciding in the core costs one more `read` per
  add, a `marketplaceState/read` round trip on IntelliJ.
- An add could decide with `marketplaceAddOutcome` before it fetches and skip
  the fetch for an entry already registered, saving one fetch of a marketplace
  the user named. Nothing fetches when a workspace opens, so in a workspace opened
  after an entry was registered for all projects, that add would say the entry
  is registered and still offer none of its templates.
- A port for `MarketplaceCache` or `DiffPaneStore` would add an interface with
  one implementation that no host or spec substitutes; the specs already run
  the real stores over the in-memory host kit. A second implementation is the
  point to extract one.
- Wiring each feature per host kept the hosts simple to read but let the copies
  drift: the bridge stopped re-linting on edits and setting changes, and did not
  isolate failing session hooks. Feature modules in the core cost a little
  indirection — a host reads its surface mapping, not the flow — in exchange for
  one place per fix.
- The core filtered listings after the host returned them. That kept the
  rule in one place but let every host read `node_modules` and build output
  first: Bun's `fs.glob` spent 206-273 ms per listing on this repository,
  a pruned walk 3-5 ms. Handing the host the exclude costs a stricter port
  contract: an adapter that ignores the exclude, or matches it against
  absolute paths, lists those folders again. The workspace contract checks
  all three adapters; on VS Code it checks that `VsCodeWorkspace` forwards the
  exclude, while a fake of `findFiles` stands in for VS Code's own matching.
- The additional files picker capped its listing at 20, and each host cut the
  list before the core sorted it, so the hosts offered different files. The
  pickers offer every match instead, at the cost of reading every match of
  `**/*.{form,json,dmn}` on a large workspace.
- `BpmnEditorFeature` could import the features whose commands it routes, if a
  composition folder were exempt from the cross-feature rule. That exception
  would never shrink, so the features hand their handlers and participants to
  it as contributions instead, at the cost of one slot per contributing feature
  in `BpmnEditorContributions`.
- A WebSocket relay would add a second reconnect lifecycle and a server to the
  bridge. Stdio uses the browser the JVM already owns and gives one recovery
  boundary. A browser-only host may need a different transport.
- Bundled Node and Node SEA remain more involved distribution options;
  GraalJS would change the seam and introduce unproven JS compatibility costs.
  Bun accepts platform-specific binaries and runtime maintenance in exchange
  for the tested single-toolchain distribution.
- Crash recovery starts from the host Document. Edits that never reached that
  document before a crash can be lost.
- Package semver and shared dependency alignment are real maintenance costs;
  their release mechanics are recorded in [Release and publishing](release-and-publishing.md).
