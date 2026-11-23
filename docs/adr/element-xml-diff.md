# Element XML diff

- Status: accepted
- Last reviewed: 2026-11-23

## Context

In VS Code's BPMN diff, the context pad of an element opens a text diff of that
element's XML from both versions, in an editor group below the diagram diff. While it is
open, it follows the selection, which both panes share. It is the first step toward
resolving merge conflicts on the diagram (#2459), whose library is in
[Merge](merge.md).

The [diff](diff.md) record owns the diagram diff and its data library, which computes the texts.

## Decision

- *What an element's XML holds.* `elementXml(xml, elementId)` in `libs/bpmn-diff`
  returns the element's own attributes and configuration children, without `bpmndi` and
  without the children the diff reports under their own id; `incoming` and `outgoing`
  stay. Which elements the diff tracks, and that a pool's process counts for the first
  participant referencing it, is one rule, `trackedElementOf`, which `computeDiff` and
  `elementXml` share; a spec pins it to bpmn-js-differ's `ChangeHandler._isTracked`, so
  a process no participant references is untracked, as upstream has it. The text is
  re-serialized, not cut from the file: no engine descriptor is loaded (one parse, no
  `modelerTemplate` collision, extensions round-trip as generic elements), attributes
  without a descriptor are sorted, and each namespace gets one prefix shared by both
  versions, built from both documents' declarations, of which the snippet declares the
  ones it uses. Formatting, attribute order, comments and a renamed prefix therefore
  never show as changes; the cost is text that is not the file's bytes. It is not exported from `@miragon/bpmn-modeler/diff`.
- *No silent loss.* The declarations are read with saxen, the parser's own tokenizer,
  so comments, CDATA and text declare nothing and URIs are decoded as the parser decodes
  them. The prefixes go to the parser as moddle-xml's `nsMap`, set when the moddle
  instance is created and never changed. A guard still rejects a snippet that uses a
  prefix it cannot declare, and skipped content rejects as in `computeDiff`, since a
  dropped attribute would show a wrong diff. `nsMap` and the prefixes the serializer
  declares by itself are undocumented, so they sit behind the `moddleNamespaces`
  adapter (see [dependencies](dependencies.md#private-upstream-apis)); its spec, the
  guard and the namespace specs turn an upgrade that changes them into a failing
  build. A call builds two moddle instances and parses the whole document, twice per
  selection. `elementSnapshots` gives every element's text from one parse through the
  same serialiser. A child without an id is never an element of its own: it stays in its
  parent's text, since nothing else could report it.
- *The panes share one selection.* `DiffViewer` takes `DiffViewerOptions.additionalModules`,
  as `createViewer` does, so only the webview adds a context pad and an outline. The viewer
  reports the single selected element (`onSelectedElementChanged`, a BPMN id or `undefined`
  for an empty or multiple selection) and applies the partner's (`mirrorSelection`, which
  clears on `undefined`, on an absent element and on another plane, and reports nothing
  back). The names differ from `SelectionManager.onSelectionChanged`, which reports diagram
  ids such as `X_label` that do not name the same element in two versions; `bpmnElementIdOf`
  is the one rule that maps a label to its element and a plane to its subprocess, for the
  selection, the context pad and the plane a pane reports. An import reports no selection,
  so a pane that loads late does not clear its partner's. A background click posts
  `NO_DIFF_SELECTION`, which the core ignores for the XML diff, so an open one stays as it
  is. Which selection and viewport changes are the user's is one guard (`UserChangeGuard`),
  read by the listeners and the resize rule alike, so a selection the pane does not report
  as the user's is not centred as the user's on resize either; the one exception is a step's
  selection, which is not reported but kept in view.
- *A step selects its change*, as a click does and as in the
  [merge view](merge-view-picking-and-building.md). Each pane that draws the change
  selects it after its own cursor entered the change's plane, since diagram-js drops a
  selection on `root.set`, so its context pad opens; a pane that lacks it anchors on a
  neighbour, selects nothing and drops its old selection. The stepping pane then posts
  the change as the selection, also one only the partner draws, so an open XML diff
  follows on the selection's route and a closed one stays closed; the partner's mirror
  finds the change selected already, so nothing echoes. The decision lives in the
  webview's `diffStepSelection`, which `DiffMode` and the merge view's step both apply;
  a diff pane knows a change only its version has from its side of
  `ApplyDiffHighlightsQuery` (`BpmnDiffService` pins it). `DiffNavigator` and
  `DiffPaneCoordinator` only name the change and whether a pane drew it, so a
  `DiffPaneCoordinator`, which shares no selection, selects nothing by itself. The blue
  glow stays beside the outline: it marks the stepper's place, which a later click does
  not move. Show all keeps the selection, as the merge view's does, except where leaving
  a sub-process plane drops it. The cost: two webview callers that each read the stepped
  change their own way, and a core that cannot tell a step's selection from a click's.
- *A connection's pad stands centred above its middle*, where it plainly belongs to the
  connection: diagram-js puts it on the arrowhead, over the shape the connection points
  to. `ConnectionPadPlacement` reopens a selected connection's pad for the connection
  alone, which diagram-js places at the top right of its bounds, and moves it from there
  by an offset to the polyline's midpoint that it recomputes on every zoom, so the merge
  card below a flow never meets it. It uses only the public `selection.changed`,
  `contextPad.open`, `contextPad.close`, `canvas.viewbox.changed` and
  `contextPad.open(target)`. The cost: every pad provider of a diff or merge pane also
  answers `getMultiElementContextPadEntries` for that one-element pad, and the offset
  assumes diagram-js's 8-unit margin and bounds-based place.
- *Resize.* Opening the group below takes the panes' lower half. diagram-js's
  KeepSelectionVisible is replaced in every `DiffViewer` by its own rule in one pane:
  the one the user selected in, or for a step the stepping pane, or the partner when
  only it has the change (`selectStep`'s `keepInView`). When a resize cuts off a
  selected element that was fully in view, that pane centres it as a user pan, so the
  partner follows through the viewport sync; the mirroring pane never scrolls, since
  its own scroll posted a competing viewport. A selection the user panned away from, or
  one still in view, stays put. The rule runs on every viewbox, selection and size
  change instead of upstream's debounce. The cost: the partner follows after the
  viewport debounce. The webview depends on diagram-js directly at the package's pin,
  because bpmn-js's context pad needs `modeling`, which a viewer lacks.
- *One switch per host.* The host's element XML handler, handed to `BpmnDiffService`,
  is the only input: its presence sets `ApplyDiffHighlightsQuery.elementXmlChanges`,
  which shows the entry, and decides whether the router handles
  `ShowElementXmlChangesCommand` and the follow, so an entry whose clicks are dropped
  cannot occur. VS Code passes it where the API has `TabInputTextDiff` (not every
  Theia does); the bridge always passes it. A merge pane gets the same answer through
  [`MergeHostOffers`](merge-xml-editor.md#decision).
- *The core decides.* The core computes both texts and the title behind the render-only
  port `ElementXmlDiffView`. The rules for requests live in the domain object
  `ElementXmlRequests`: only the latest renders, the same element twice renders once, a
  failed request can be retried, and selections are skipped until the user asks for the
  XML diff and again after the user closes it. The view reports that close through a
  constructor callback, so the port stays render-only; `describeElementXmlDiffViewContract`
  pins the behaviour both views must share. Sessions retire in the core:
  `DiffPaneStore.detach` serves both hosts and tells `onSessionClosed` listeners, so the
  XML diff closes when the diagram diff's last pane goes. Each diagram diff has its own
  XML diff, also two tabs of the same files.
- *The title names the versions.* Each pane handle reports the version it shows
  (`DiffRevision`), and the core titles the XML diff as the VS Code Git extension titles
  its own diffs: both files of a compare, `order.bpmn (Working Tree)` against HEAD or
  `~` (the index, or HEAD when nothing is staged), `order.bpmn (Index)` against HEAD, and
  otherwise `order.bpmn (3f2a1b4) ↔ order.bpmn (HEAD)`; the file name alone when a
  version is unknown. The core shows a ref as the host names it: VS Code's
  `documentRevision` is the one home of what the plugin knows about Git URIs, and commit
  hashes are cut to the Git extension's default seven characters (`shortCommitHash`,
  shared with the merge view's captions), so the title ignores a changed
  `git.commitShortHashLength`. Theia's own Git integration (`gitfs:`) and the bridge
  report unknown; the standalone app ships VS Code's Git extension, so its panes are
  `git:` too. The core also orders the sides of an SCM diff by version (a commit, the
  index, the working tree); two commits keep the order their panes resolved in.
- *IntelliJ shows it inside the diagram diff.* The bridge forwards the view as
  `elementXmlDiff/*` notifications. The XML diff carries the diagram diff's before pane
  (`ElementXmlDiff.paneUri`), because the core's key is its own and the host finds its
  viewer by pane. The viewer splits off a `DiffRequestPanel` below the two browsers, so
  the XML diff closes with the diagram diff without a message; its sides take the
  diagram diff's side titles, since the bridge reports no revision. The host owns the
  refresh rule: a refresh replaces only what the slot of that key shows, and the slot
  runs on the EDT, where the user's close runs too, so a refresh in flight cannot
  reopen what the user closed.
  A swap reopens the diagram diff under a new key, so the old key's late frames are
  ignored. The cost: that refresh rule exists twice, in the VS Code view and in Kotlin's
  `ElementXmlDiffSlot`, plus a loopback copy in the bridge's contract spec. The loopback
  runs `describeElementXmlDiffViewContract` and the rows of
  `intellijElementXmlDiff.cases.json`, which `DiffRouterElementXmlDiffTest` runs against
  `DiffRouter` and the slot, so a change to the Kotlin rule fails until the rows change.
- *An editor group, not the panel.* The panel cannot hold a text diff editor, and a
  native diff gives search and inline or side-by-side view for free.
  `workbench.action.newGroupBelow` plus `focusAboveGroup` places it without rewriting
  the user's layout, as `vscode.setEditorLayout` would; where the command is missing it
  opens beside. Each element gets fresh read-only URIs, because VS Code cannot rename an
  open tab: the new tab replaces the previous one, which is closed, so one XML diff tab
  stays open per diagram diff. A tab the user moved is still followed, a group the user
  emptied is reused, and tabs a window reload restored or the user reopened are closed,
  since their texts are gone; the scheme is an activation event, so a reload closes
  them before any BPMN file opens. The group below is split from the group that is
  active once both texts are parsed: a click into another group within those tens of
  milliseconds puts the XML diff there.
