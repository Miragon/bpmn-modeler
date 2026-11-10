# BPMN plugins

- Status: accepted
- Last reviewed: 2026-11-13

## Context

Teams want to load bpmn-js plugins, many written for the Camunda Modeler, without forking a host or
building an app on the package ([#1626](https://github.com/Miragon/bpmn-modeler/issues/1626)).
Plugins shipped in VS Code 1.21.0 and IntelliJ 1.16.0; Orca
([#2244](https://github.com/Miragon/bpmn-modeler/issues/2244)) reuses the same core and package.
The [user guide](../vscode/features/bpmn-plugins.md) carries what users must know. Whether a plugin
may run is decided by its [allowance](code-allowance.md), which bpmnlint
[rule packages](bpmn-linting.md) share.

## Contents

- [Format](#format)
- [Ownership](#ownership)
- [Loading in the IDE webview](#loading-in-the-ide-webview)
- [Discovery](#discovery)
- [Serving and the cache](#serving-and-the-cache)
- [IntelliJ](#intellij)
- [What a plugin can reach](#what-a-plugin-can-reach)
- [Alternatives](#alternatives)

## Decision

### Format

A plugin is a classic script that pushes `{ type, plugin }` onto `window.plugins`, the contract of
`camunda-modeler-plugin-helpers`, plus an optional stylesheet. Unmodified Camunda bundles that
register bpmn-js modules or moddle extensions therefore load
([#2241](https://github.com/Miragon/bpmn-modeler/issues/2241) ran 12 real ones; the user guide has
the table).

- Registration types map to engines as Camunda's product lines do: `bpmn.modeler.*` applies to
  every engine, `bpmn.platform.modeler.*` to C7 and `bpmn.cloud.modeler.*` to C8. An untagged model
  gets only the registrations made for every engine.
- A registration of any other type (`lintRules.*`, `dmn.*`, `client`) is ignored and logged.
- A bundle that imports the helpers' `vendor/*` modules (properties panel extensions, React client
  extensions) throws before it registers anything, because the editor defines none of Camunda's host
  globals. It is reported as a failed plugin.

### Ownership

Each layer owns one part, so every host and npm consumer takes only what it needs.

| Layer | Owns | Does not own |
| --- | --- | --- |
| `@miragon/bpmn-modeler/plugins` | Loading scripts from URLs, mapping registrations to engines, building with a fallback | Discovery, trust, network, UI |
| `libs/modeler-types` | The load report texts | Where they are shown |
| `libs/modeler-core/src/bpmnPlugins` | Discovery, manifest reading, the reload rule, the catalog and the cache delivery | Webview code, host widgets |
| Hosts | Ports and a cache folder the webview may read | Any rule or text |

- The package decides no trust. Plugin code runs with the page's authority, and an npm consumer
  decides where plugins come from and whether to load them.
- `/plugins` is a subpath like `/lint`, so a consumer without plugins never bundles the loader; the
  [plugins-free entry check](../../packages/bpmn-modeler/scripts/check-plugins-free-entry.mjs) keeps
  the root, `/design` and `/mode` from reaching it.
- A broken plugin never keeps a diagram from opening: `buildWithPluginsOrWithout` builds a surface
  with the plugin modules and, when that throws, reports the error and builds again without them.
  The fallback lives in the package, not the IDE webview, so Orca and npm consumers get it too. It
  covers construction only; a plugin that throws later, in a listener or a render, is neither
  contained nor named ([#2270](https://github.com/Miragon/bpmn-modeler/issues/2270)).
- The loader takes URLs. Orca's isolated frame admits neither `blob:` nor `data:` scripts, so its
  delivery needs inline text or a policy change upstream (#2244).
- `PluginCatalog` in the core is host-neutral and knows no editor session, so Orca's worker can
  answer its frame from it directly.

### Loading in the IDE webview

Modules are fixed at construction, so the BPMN webview needs the plugins before it builds a surface.

- It asks once the file reply shows that the page is an editor, because a diff pane never asks. The
  Design and Implement factories await the answer together with their surface module, so the round
  trip overlaps the module load. The wait is bounded (`HOST_REPLY_TIMEOUT_MS`); without an answer the
  editor opens without plugins and logs it.
- The answer is its own message, not part of the file reply: the VS Code smoke suite measures the
  time from opening a file to its first surface.
- Plugins go into Design and Implement, never into View, whose NavigatedViewer lacks the modeling
  services plugins build on.
- A host that does not wire the feature answers with no plugins (`answerWithoutPlugins`).
- Every change of the approval list reloads the open editors it makes stale, since modules cannot
  change after construction (`editorsToReload`). It reads the allowance state only: a plugin edit
  reloads nothing, as the next request copies the new bytes under their new hash.

### Discovery

The core finds one plugin per subfolder of each `<configFolder>/plugins/` between the document and
its workspace root. It reads `plugin.json`, or scans a Camunda `index.js` for string literals
without running it. Paths must stay inside the plugin folder (`staysInsideFolder`, the rule the
template marketplace applies to repository paths too). A plugin runs once its allowance holds.

The locator keeps a memo per plugin folder and drops it on a watcher event, so an editor open does
not reread and rehash every bundle; Camunda bundles can be several MB. The plugin's id stays the
folder as the workspace spells it, which is what a 1.21.0 row names, while the allowance comes from
that folder's realpath.

### Serving and the cache

The page never reads a workspace folder. The core copies an allowed plugin's bytes into a
content-addressed cache (`<cache root>/<hash>/plugin.js` and `plugin.css`) and serves them from
there. A file swapped after the copy, and a file beside the script that no manifest names, therefore
cannot reach the page, and the webview's resource roots stay fixed at creation. The content hash
names only the cache copy; no allowance reads it.

- The copy reads each cached file back and rewrites it when its bytes differ, since a write cut
  short by a crash would otherwise be served as it is.
- The cache prunes by last use and reads no approval row, as no row names a hash. Each copy holds a
  `last-used` marker that serving refreshes at most once a day. A prune at process start removes the
  copies no editor of this process is served and whose marker is missing or 30 days old. The Add-ons
  action "Remove unused plugin copies" uses an idle limit of zero.
- A revoke prunes nothing: a copy is served only for an allowed plugin, so a revoked plugin's copy
  ages out.
- The cache is shared by every process of the host, so another process can prune. A copy found in
  the per-process memo is checked on disk and written again when it is not whole.
- Pruning on every approval change was rejected: the next start's prune covers the shared cache, and
  several bridges pruning at once only add noise.
- VS Code roots the webview's cache folder at a `file:` URI. Desktop VS Code hands out global storage
  as `vscode-userdata:`, and a webview serves a file only below an allowed folder of the same scheme
  as its URL.

Accepted residuals: a page that loads between another process's delete and this process's check
leaves the plugin out once. VS Code writes a file in place, so a prune in another window can read a
marker being rewritten as empty and remove a copy an editor there was just served; an atomic write
in `VsCodeWorkspace` would close it but changes every write of that adapter.

### IntelliJ

The bridge wires the same feature as VS Code, so the texts, the notice, the list and the reload rule
are the core's. The host supplies these parts:

- *Cache root.* One folder per machine below the IDE system path, shared by every project and
  bridge. The bridge writes a temporary sibling and renames it, so a page never loads a file that
  another project's bridge is still writing. The launcher passes the root to the bridge
  (`MIRAGON_BPMN_PLUGIN_CACHE`) and the webview server serves from the same value, so the two cannot
  disagree.
- *Route.* Only `<root>/<64 lowercase hex>/plugin.js|plugin.css` maps to a URL
  (`CACHED_PLUGIN_FILE_PATTERN`). The server matches the raw request path before decoding, so `%2F`
  or `%2e%2e` cannot form a separator. The served file must be a regular file that is not a symbolic
  link, and its real path must stay inside the cache's. The CSP is unchanged, since `'self'` already
  admits same-origin files. `pluginAssetUrl.cases.json` holds the rows for the bridge spec and the
  Kotlin `WebviewRouteTest`.
- *Reload.* The page asks for plugins only while it boots, so a soft reload cannot load new ones.
  `editor/reload` makes the host write the page's unsynced edit into the Document, register the
  session again and reload the page.
- *Shim.* The page's own wiring is single-use: `acquireVsCodeApi()` hands out a frozen API once, and
  the sink setter deletes itself on its first call. This stops accidental reuse; it is no boundary
  against an allowed plugin. CEF's message router keeps the query function on `window` in every page
  context, so a plugin can post to the JVM and read the host's messages.

### What a plugin can reach

An allowed plugin has the page's full authority, on both hosts. It gets the modeler's injector, so
it can edit the diagram (edits sync to the file) and call every DI service, including those that
hold host ports (navigation, clipboard, script editors). The BPMN webview's `img-src https:`, needed
for element-template icons, lets it send data out through image URLs. The allowance is the control;
a tighter CSP cannot close this, and the user guide says so.

The editor exposes none of its bpmn-js, diagram-js, moddle, preact or properties-panel instances.
In #2241 every bpmn-js plugin that works got what it needs through injection, including plugins that
bundle their own diagram-js helpers; the Camunda Modeler exposes none of these either. Instance
identity matters only for properties panel extensions: helpers-built ones read
`window.vendor.propertiesPanel`, and a plugin with its own copy of the panel stack breaks the whole
panel. They stay unsupported. A full `window.vendor.propertiesPanel` would make the panel library,
`bpmn-js-properties-panel` and its preact a plugin API with a version policy, so it is left to its
own decision ([#2265](https://github.com/Miragon/bpmn-modeler/issues/2265)), with one exported
instance set, an error boundary around plugin groups and a contract test as preconditions.

### Alternatives

- **Our own module format only**: loses the Camunda ecosystem.
- **Running `index.js` in the extension host**: runs unapproved code with Node authority.
- **Serving from the workspace folder**: approval and load race, and siblings of the script become
  loadable.
- **Discovery and approval in the package**: forces one trust model on npm consumers and pulls
  filesystem access into a browser package.
- **The fallback in the IDE webview**: Orca and npm consumers would each copy it.
- **Exposing bpmn-js and diagram-js to plugins**: no tested plugin needed it, and it would make
  their versions a plugin API.
- **A `window.vendor` with only the properties panel components and no preact entries**: still
  couples us to that preact, and breaks the plugins compiled against its JSX runtime or hooks.
