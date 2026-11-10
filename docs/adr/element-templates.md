# Element templates

- Status: accepted
- Last reviewed: 2026-11-13

## Context

Element templates reach users through three authoring surfaces: a template
editor, a preview of the properties panel a template produces, and marketplaces
that supply templates. They span the npm package, the core and both IDE hosts.
Applying templates (and hiding them from new choices) is part of the modeler's
public API, see [BPMN modeler](bpmn-modeler.md#public-api-and-capabilities). The
[Add-ons view](add-ons.md) lists templates and marketplaces and offers the per-user
[template switches](#template-switches).

## Contents

- [Preview](#preview)
- [Template editor](#template-editor)
- [Marketplaces](#marketplaces)
- [Template switches](#template-switches)

## Decision

### Preview

Template authors need to see the properties panel a template produces without
applying it in a diagram, for C7 and C8 alike. `createTemplatePreview(panelParent,
options)` renders that panel and nothing else. It is exported from the package
root, not a subpath, because it only composes `createModeler` and adds no
dependency to the module graph.

- One modeler per engine on an offscreen canvas, replaced when the engine
  changes. Each `show(template, engine)` imports a fresh diagram, loads the
  template as the only one and creates an element with
  `elementTemplates.createElement`, so an `elementType` builds the right type. It
  clears the engine-version gate the fresh diagram pins, so a template for another
  version still shows. Calls are queued because each re-imports.
- A template the validator rejects is reported as messages and the panel keeps the
  last template that rendered rather than going blank. The language is page-global
  like the modeler's.
- Upstream collapses a template's groups, which reads as an empty preview, so a
  low-priority properties provider marks them `shouldOpen`. That is only a default:
  the user's toggles win and survive each re-import. It deliberately overrides a C8
  group's `openByDefault: false`, because a preview that hides its own fields
  misses its purpose.
- Templates for a process or a sequence flow are reported as not previewable
  (`unsupportedType`): selecting such a templated element throws inside
  create-append-anything's remove-template replace entry, which also affects the
  modeler itself and needs an upstream or local fix.

### Template editor

The element-template editor is the main editor for template files in VS Code.
Files in an `element-templates` folder open in it through a default editor
association (as `*.form` opens the Form editor), and any `.json` file can be
opened in it with **Open With…**. Its custom editor has `option` priority on
`*.json`, so it never takes other JSON files over.

**Builder.** The main area is `@miragon/bpmn-modeler-element-template-builder`, a
form over the template laid out like VS Code's settings editor (search, tabs for
template, groups and properties, an index, the chosen item's settings). Because it
is shown inside the IDE it is drawn with its own Preact components and coloured
only by `--vscode-*` tokens, so it follows light, dark and high-contrast themes.
The properties panel the template produces sits right as a preview; findings from
the official validator and the builder's own rules dock under the form; the JSON
is one toggle away so the host's JSON support (`$schema` IntelliSense, undo,
diagnostics) applies.

- The library depends on `jsonc-parser` because an edit must keep the file's
  formatting, comments and unknown keys, so it changes the text rather than
  reprinting a parsed template, and on `@bpmn-io/element-templates-validator` so it
  does not restate the schemas. Its Preact is the one `@bpmn-io/properties-panel`
  bundles, so the page ships no second copy.
- The catalog (the engines' data) is held to the official schemas in both
  directions by conformance and coverage specs, so a schema bump fails until
  someone decides what the builder does with a new binding.
- `applyTemplateEdits` returns a result instead of throwing: valid JSON that breaks
  the schema can make an edit impossible, and the page then writes nothing and says
  where. Fields keep what was typed while it still means the file's value. A
  template in an array file is selected by its place in the file (an edit can
  change its id), and followed by id and version when a host text edit moves it.
- The page's state is one `EditorPage` value in the library's domain with pure
  transitions.

**Page and host.** The page is a second entry of the BPMN webview bundle and
parses the file itself: a host pushes the raw text with the locale
(`ElementTemplateFileQuery`) and later language changes (`LanguageQuery`), so no
host needs a bridge session for it. The page's edits go back like a modeler's
(`SyncDocumentCommand` with the revision they were made on; a host revision that
overtakes a pending edit wins; a save flushes the pending edit first).
`ElementTemplateEditorFeature` builds the editor in the core like
`BpmnEditorFeature`, with its own `EditorSessionStore` (a template editor never
becomes the target of modeler commands or counts towards
`bpmn-modeler.openCustomEditors`), its own `DocumentFlushService` and
`PendingEditsFlush` serving `.json`. VS Code writes only the changed range of the
document (`minimalReplacement`, never splitting a CRLF or surrogate pair), so a
JSON editor open beside keeps its cursor and undo restores one edit.

**What counts as a template.** `elementTemplateFolder` and `isElementTemplateFile`
in `modeler-types` are the one rule: a file counts only if it names a template
schema or the loader reads it. The manifest's `when` clause cannot read the config
folder, so it leaves the decision to a context key the extension sets, and the
default association cannot either, so it opens any folder of that name (a file
there that holds no template gets the start form or a note). IntelliJ's provider
keeps a Kotlin copy that runs `elementTemplateFile.cases.json`. The extension also
activates in workspaces containing an `element-templates` folder.

**New template.** One scaffold, `newTemplateText` in the builder library (with
`templateIdentity` for the id and suggested name). VS Code's **New Element
Template** writes an empty file into `<configFolder>/element-templates/` and opens
it; the start form asks for engine and element type, and the loader reads the
empty file as holding no templates. IntelliJ has no command until it has the
builder: a stub would be a second scaffold in Kotlin, and calling the TypeScript
one would need a new request type, since host-to-core calls on the bridge are
notifications today.

**IntelliJ** shows the same page as a preview only: its shell marks `#app` with
`data-view="preview"`, so the page leaves out the builder, start form and engine
choice and never sends an edit. A template's JSON opens in a
`TextEditorWithPreview` holding the IDE's JSON editor and the page; the provider
builds the split editor directly because the platform's provider base class is
experimental on the 2024.2 floor. The page therefore has two host wirings, the
core's feature in VS Code and Kotlin in IntelliJ, and
`elementTemplatePreviewMessages.cases.json` in `libs/shared` pins the messages
they exchange and the commands the page may post (IntelliJ's test reads the same
rows). IntelliJ sends no document revision, since a preview makes no edits.

**Schema trust.** VS Code only downloads a JSON schema from a trusted domain and
unpkg is not a default one. Its JSON client also trusts a URL an extension
contributes through `jsonValidation`, so the manifest contributes the two
published template schema URLs with an empty `fileMatch`: that trusts exactly
those URLs, leaves the user's `json.schemaDownload.trustedDomains` alone and
assigns the schemas to no file (a template folder does not tell C7 from C8). This
relies on client behavior, not documented API, so the VS Code smoke test pins it,
with a version-pinned URL as the control that must still warn.

### Marketplaces

The add and remove flows run in the core's `MarketplaceCommands`
(`template-marketplace/service/`) on both hosts; `marketplacePrompts.ts` builds
all their text ([core-built text](architecture-and-hosts.md#host-integrations)).

- *Remove* is a `chooseMany` choice over entries named with the scopes that hold
  them, so it needs no new port method. The add-on catalog removes one named entry
  through a confirm instead.
- *Add* asks for free text and a scope together, which no `PickerPort` method can,
  so `MarketplacePromptPort.promptForMarketplace` takes a core-built
  `MarketplaceAddPrompt`. The core validates the location (`registrableLocation`)
  and asks again with the refused entry until it can register one or the user
  cancels. The prompt also carries the check as a function (`problemWith`), which
  VS Code runs as the user types; a function cannot cross the bridge, so IntelliJ
  learns of a refusal only when the core asks again. Each host keeps its layout
  (VS Code in steps, IntelliJ in one form). A command started again while its own
  question is open asks nothing.
- *Token.* The marketplace asks for a personal access token in a masked input,
  which a chooser cannot show, so it has its own port (`TokenPromptPort`) taking a
  `TokenPrompt` the core builds (`tokenPromptFor`, worded for a refused request or
  a source declared private). The session stores the answer per host. Hosts return
  the answer as typed and the core (`enteredToken`) takes a blank for no token, so
  a blank token is never stored and no host trims.
- *Registrations.* Each host keeps them behind `MarketplaceRegistrationsPort`:
  `read` returns each scope's *own* list as the host stores it, the scopes the host
  can write now with where each is saved, and where a self-hosted marketplace is
  written by hand; `register` and `unregister` write. The core merges the lists
  (`registeredMarketplaces`: each entry once with every scope that holds it,
  all-projects first) and decides whether an add registers anything
  (`marketplaceAddOutcome`) on a read made after the fetch. Hosts used to decide
  per host: two copies of the rule and a test fake that followed neither. The cost
  is one more `read` per add (a `marketplaceState/read` round trip on IntelliJ). An
  add that registers nothing still fetches, because the cache is per workspace and
  only an add or an update fills it.
- *Writes settle before the prune.* A write resolves only once `SettingsPort` reads
  the new list, so the prune after a removal keeps exactly what is still
  registered: VS Code reads settings live, IntelliJ pushes the snapshot before it
  acks `marketplaceState/save|remove`.
- *Scopes.* The vocabulary (`project`, `allProjects`) has one home,
  `PROJECT_SCOPES` in `kernel/domain/projectScopes.ts` (the template switches speak
  it too; Kotlin's `ProjectScope` is pinned by `ProjectScopeTest`). Where a scope is
  saved differs per host, so it reaches the core as a typed `SettingsPlace` and the
  core words "Saved in …". Hosts that worded it themselves drifted, and a text
  without the place would drop what tells the user whether an entry lands in the
  repository or in their own settings.
- `describeMarketplaceRegistrationsContract` runs these rules against the test
  fake, VS Code's adapter and the bridge's adapter; shared rows hold the bridge's
  loopback to the Kotlin router (`intellijWritableScopes.json`).

### Template switches

A user can turn a template, or every template of a source, off for themselves. A switch
is a preference, not trust: it keeps a template out of new choices
([hidden element templates](bpmn-modeler.md#public-api-and-capabilities)), and an
element that uses one keeps it. The rules live in `kernel/domain/templatePreferences.ts`;
a host opts in with the optional `TemplatePreferenceStorePort` (VS Code and the IntelliJ
bridge do).

- *A switch* is `{ source, templateId? }`: the template id within its source, every
  version and file of it. The source key survives what it must. A config folder is keyed
  by the innermost workspace folder's name and the path below it, so a moved repository
  keeps its switches; a marketplace by provider, host and repository without the ref, so
  a ref edit, a re-fetch and a new cache generation keep them. Two roots with the same
  name and config path, and one repository registered at two refs, share their switches.
- *Scope.* Each source's switches live in one scope, which the core decides: a config
  folder's in `project`, a marketplace's in `allProjects` once any entry of its
  repository is registered for all projects. A union of both scopes was rejected: a row
  left in `allProjects` after a User registration was removed would hide the marketplace
  in every project that registers it per project.
- *Hidden refs.* The page tells copies apart only by id and version, so a ref is hidden
  only when every loaded copy of it comes from a source that does not offer it. When the
  copy switched off is the latest version, its id is not offered, though another source
  serves an older version: upstream offers only the latest, and a substitute rule on the
  page for one case was rejected.
- *Store.* A change names the switches to disable and to enable in one scope, and the
  store merges it (`templatePreferenceChange.cases.json` holds the rows for both
  languages), so a writer never drops a switch it had not read. The settings snapshot
  was rejected as the store: VS Code workspace settings live in the repository, and a
  whole-list write races across IntelliJ projects. Where each host stores them is in
  [host-replicated state](intellij-bridge.md#host-replicated-state).
- A switch change sends only the hidden refs to each editor whose refs changed, so
  nothing is read, validated or reported again.
- A switch action is refused unless the latest catalog build offered it
  ([allow and revoke](add-ons.md#allow-and-revoke)).

## Alternatives rejected

- A generic text-input port beside `TokenPromptPort` plus `PickerPort.choose` for
  the scope would cost the same protocol (one method, one RPC, one Kotlin handler)
  but split IntelliJ's one form into two dialogs and make the core sequence two
  prompts. Folding the token into a text prompt with a `password` flag changes
  `tokenPrompt/show` and makes log redaction depend on a flag instead of the
  method.
- Checking the location only after the answer would cost VS Code its check as the
  user types and make it ask for the scope before saying the location is wrong.
- IntelliJ could piggyback registrations on `marketplace/add|remove`, saving
  `marketplaceState/read`, but the bridge would need a mirror for them and a read
  would hang off a trigger.
- Deciding an add before the fetch would skip a fetch for an entry already
  registered, but nothing fetches when a workspace opens: in a workspace opened
  after an entry was registered for all projects, the add would say it is
  registered and offer none of its templates.
