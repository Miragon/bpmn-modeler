# Merge

- Status: proposed
- Last reviewed: 2026-11-18

## Context

A Git conflict in a BPMN file leaves conflict markers in XML that the modeler cannot open.
The merge resolves it on the model: Git's three index stages (base, current, incoming) are
classified element by element, the user decides what is left, and one valid file is built.
Epic #2459 keeps the merge in VS Code first and out of the published packages. This record
covers the data library; the view that shows a conflict as diagrams and the line-wise XML
merge in VS Code's merge editor have records of their own ([merge view](merge-view.md),
[merge view picking and building](merge-view-picking-and-building.md),
[merge XML editor](merge-xml-editor.md)).

## Decision

### One unpublished library

`libs/bpmn-merge` (`@miragon/bpmn-modeler-merge`, flat, DOM-free like `libs/bpmn-diff`)
holds `computeMerge`, `MergeDecisions` and `buildMerged`. It is not in `libs/bpmn-diff`,
because the diff result is a semver contract of `@miragon/bpmn-modeler/diff` and the merge is
not published; `.github/release-lines.json` ships the workspace on the hosts only, not on the npm line.
It depends on `bpmn-diff` for the parse, the element text and the reference walk, so both
share one notion of an element's XML, and on `@miragon/bpmn-modeler-types/engine` for the
modeler's engine rule. It imports that subpath, not the barrel, which would pull DOM-typed
modules into a DOM-free library.

The core imports it, so its consumers' TypeScript `lib` (`ES2021`, `tsconfig.base.json`)
binds it too: it calls no ES2022 or later library API (`findLast`, `Object.hasOwn`, an
`Error`'s `cause` option), and its own tsconfig compiles with `lib: ["ES2021"]` so the next
one fails its build. Rejected: raising `lib` in the core, the bridge and the plugin, three
consumers for five call sites. The library also holds what a merge view shows of the
decisions, as pure projections (`mergePaneView`, `mergePaneSteps`, `mergeNavigationOrder`,
`hasNoShape`); the [merge view record](merge-view.md) says why.

The core, the protocol and the merge view's webview share one vocabulary: the two sides, the
markers a pane paints and their classes, the roles a pane caption gives a side and the caption
itself. Its home is `libs/modeler-types/src/mergeVocabulary.ts`, which imports nothing at
runtime; the library reaches it through the `@miragon/bpmn-modeler-types/mergeVocabulary`
subpath, everything else through the barrel, whose exact specifier is the only one the core's
`domain/` may import. `MergeSide` moved there, and `mergeResult.ts` re-exports it.

`libs/modeler-types` and `libs/bpmn-i18n-extras` are inlined into the npm package, so a change
to either counts toward the npm component. The vocabulary file is excluded from that
component like this library. The other edits the merge view needs in those libraries land in
two `chore` changes around the feature changes: one before them (the `"merge"` and
`"merge-result"` diff origins, the `"merge"` viewer mode, and a diff legend that takes its own
count slots and an extension element), one after them with the webview's translations. The
feature changes touch only excluded paths, so the merge view adds no entry to the npm
changelog and no version bump. Cost: the exclusion is by path, so a published file that later
imports the vocabulary is not excluded; and the published barrel carries the vocabulary,
although no package entry re-exports it.

### Merge elements

The merge decides on its own set of elements, `isMergeElement`: what the diff tracks as
itself, plus every root element (message, error, signal, escalation, data store, item
definition, category, interface and the rest), the process, text annotations, associations,
groups and data objects. The diff folds these into their participant, which would make two
unrelated annotation edits a conflict on the pool, and it does not track root elements at
all, although event definitions and operations name them. Event definitions,
`ioSpecification`, lane sets, labels and extension elements stay part of their element.

- *Elements are matched by id, and only an element with an id stands on its own.* An
  element deleted and drawn again has a new id and shows as removed and added. A child
  without an id inside a merge element, such as a data association some exporters write,
  stays inside it, in `elementSnapshots` and in `elementXml` alike, so a change to it is a
  change of that element and never lost. A root element or a lane without an id has no
  such element to stay in (definitions is none, and lane membership is keyed by lane id),
  so a version holding one is refused, naming the side and the type.
- *One parse per version.* `elementSnapshots(xml, { isUnit, prefixSources, rejectWarnings })`
  in `bpmn-diff` returns every element's text, parent, lanes, references, inner ids
  (`parts`), the non-element object holding it (`container`, such as a lane set), its plane
  and its layout from one parse; it shares its serialiser with `elementXml`, so the default
  unit rule gives the same text. Calling `elementXml` per element costs one parse each
  (about 40 ms at 0.8 MB), far too slow for three versions.

### Classification

`computeMerge({ base?, current, incoming })` gives each element one state from the three
versions. The fourteen states with a base are the table in #2450; four of them are
conflicts: both changed, both added, removed and changed, changed and removed. Without a
base, an element only one side has, or that the sides hold differently, is a conflict.

- *Only clean versions.* A version that parses with any warning is refused, naming it:
  moddle drops an unresolved reference with nothing but a warning, so a merge would lose it.
  It is parsed a second time with the merge's engine descriptor (current's engine, else
  incoming's), which warns on an engine attribute or extension element the descriptor does
  not know: the file is built with that descriptor, so such a version could never be built.
  `requireMergeableVersions` holds every up-front refusal, so building the file can run the
  same checks. A refusal is thrown as a typed `MergeRefusal` (a text the parser rejects, one
  that parses with warnings, two engines, an element without an id), which `mergeRefusalOf`
  reads, so a caller explains each in its own words; the error's English message is for a
  developer. Any other error the library throws is a bug, not a refusal.
- *What a state compares.* The element's text without its child elements, `bpmndi` and
  the derived references `incoming`, `outgoing`, `flowNodeRef` and `boundaryEventRefs`,
  together with its parent and its lanes. Keeping derived references would make both ends
  of an added flow look changed, and any edit to them a conflict. An element moved into
  another sub-process or lane is changed; a lane itself does not change when its members
  do.
- *Layout apart from content.* Bounds, waypoints, labels and DI attributes are classified
  on their own and are never a conflict; whose drawing the result takes is the *Layout
  side* below. Both sides changing a layout, even alike, and sides that draw an element
  differently without a base, are one state, `bothChanged`. DI references are compared by
  what they draw, never by DI ids.
- *Plain JSON.* `MergeResult` holds ids, states and each version's parent, container,
  lanes, references, parts, plane and whether it is drawn, but no text, so it crosses the
  webview boundary; texts are fetched on demand. `versionKeys` fingerprints each version's
  XML (FNV-1a 64, not a secure hash), so a result can be checked against the texts it was
  computed from without carrying them.
- *Engines.* The modeler's one rule, `detectEngineWithNamespaceFallback`
  (`modeler:executionPlatform`, then the version, then the Camunda 7 or 8 namespace on the
  definitions root), names each side's engine. Detected engines must agree; a side without
  one merges with either, since a save drops an engine namespace nothing uses.

### Decisions and reference rules

`MergeDecisions` holds the decisions of one merge: the automatic resolutions, the user's
picks and what keeps the result whole. It imports only the result types; a spec mocks the
parser and asserts that the module still loads.

- *One rule.* Every element in the result needs, in the version its side gives, its
  parent, the container it sits in, each of its lanes and every reference target the parse
  lists (both flow ends, boundary host, `default`, the event definitions' message, error,
  signal and escalation, data object and store, data association ends, compensation,
  `processRef`, `categoryValueRef`, item definitions, operations). A reference or container
  inside another element (a data association's target property, a lane's lane set) also
  needs that element's chosen version to hold the part. A generic walk over the
  descriptors' references covers every reference the parse resolves.
- *Automatic resolutions are checked too.* One that breaks the rule becomes an open
  conflict for the element and its target, computed again after each pick.
- *Elements that cannot stand side by side.* Two elements of the result that hold the same
  inner id, or an inner id that is another element's id, cannot both stay: each side's file
  was valid, but bpmn-js refuses a duplicate id. Nor can two collaborations from different
  sides with a pool of the same process, since a diagram draws one collaboration per plane
  and the other's pools would stay in the file unseen. Keeping one collaboration drops the
  other with its pools.
- *A picked element keeps its side.* Of two elements that cannot stand side by side, and of
  a dependent and the target it misses, only an automatic one opens; one the user picked,
  or one a pick decided as its consequence, stays resolved. Without picks both open. A pick
  that would keep two picked or consequential elements that clash is refused, naming the
  one it would have to change. The UI can rely on a pick it applied: the element sits on
  the picked side until the user picks or unpicks it.
- *A pick names its consequences.* It pulls in a target only its side has, or holds the
  part, and drops the dependents of an element it removes. A dependent both versions hold
  cannot be dropped, so it reopens instead of refusing the pick: its version from the side
  the target comes from cannot name the target, so that choice stays. The pick is blocked,
  says why and changes nothing when it would change an element the user picked or when no
  side satisfies it.
- *No dead end.* Every open conflict keeps a choice that applies. A pick is refused, naming
  the element, when it would leave an open element both versions hold with no version
  whose missing targets can still be pulled in. A dangling automatic target that decided
  elements need, with no other version that serves them, is kept on its side and has its
  own needs pulled in, or the pick is refused: a pick of a flow to a task in a lane the
  process no longer holds is refused rather than leaving task and lane without a way out.
  `mergeDecisionsPathIndependence.spec.ts` checks over every scenario and the hand-built
  results that each pick sits on its side and every open conflict has a choice.
  A blocked pick and a dangling resolution give the reason as data (element, requirement,
  obstacle), not as a sentence: the library ships one English `describeUnmetRequirement`,
  and a view in another locale replaces it.
  `pickWithContents` decides a container and everything in it at once; a later pick inside
  overrides it, and `unpickWithContents` takes back the container with everything inside
  picked on the same side. `unpick` takes a pick back; an element nothing else needs returns
  to its automatic resolution or to open, which is the way out of two picks that name each
  other. `originOf` tells a user's pick from an automatic resolution and from a pick's
  consequence, so a view can badge only the user's picks.
- *Keeping a removed element offers its flows and boundary events.* A pick that keeps an
  element the other side removed returns `connectionsLeftOut` and `boundaryEventsLeftOut`
  (`removedWithLeftOut`): the boundary events its side attaches to it and the flows its side
  connects to it or to them, that the other side removed with it, that nobody decided and
  the pick still leaves out, each only if all it requires besides the element and the
  offered boundary events stays in the result, so the offer brings back nothing the user did
  not ask for. `pickWithRemoved` picks them with the element in one `closePicks`, so it
  is refused as a whole and equals the plain picks. Flows and boundary events are
  dependents, not requirements, so they cannot come back as a consequence.
  `unpickWithRemoved` takes the element back with everything on its side the other side
  removed with it (`removedWith`); `unpick` alone would keep the element as a consequence of
  those picks. The library keeps no groups: picks stay its only state, and `mergePaneView`
  rebuilds a pick's reach from them alone. A container counts as kept with everything inside
  only while every element inside is picked on its side, and an element as kept with its
  flows only while one of them is picked and none it could keep is left out, so any order of
  the same picks shows the same badges and Undo takes back no pick the user made apart. Only
  a sub-process, pool, lane, process or collaboration offers everything inside; a task holds
  its data associations but offers only itself. [Picking and building](merge-view-picking-and-building.md#picking)
  covers what the offer leaves out and the build note on it; [building](merge-view-picking-and-building.md#building) a kept flow's `default`.
- *Consequences follow the picks, not their order.* The only state is the user's picks:
  each pick or unpick derives every consequence again from them over the automatic
  resolutions. Picking an element back, or unpicking it, restores what its first pick
  dropped, pulled in or settled, so no addition is lost and no closed conflict stays closed
  on its own; a sequence of picks and its final picks made on a fresh merge agree
  (`mergeDecisionsPathIndependence.spec.ts`). A dependent both versions hold that a pick
  or an unpick leaves unmet reopens rather than refusing the call. The cost is one closure
  over all picks per call, plus a pass over the result for clashes and dead ends, which is
  linear in the result for the few picks a merge has; and a pick can reopen an element the
  user did not touch, which then waits for its own choice.
- *Layout side.* Current's DI, unless only incoming changed the layout. An element is drawn
  from its own side when the preferred side does not draw it, or draws it in another
  parent, lane, host or between other ends, since bpmn-js reads lane membership and
  attachment from geometry, and from the other side when neither draws it in place: a
  process one side drew only through a pool the result drops takes the other side's
  plane, unless a pool of the result draws it. Containers settle first: an element follows its host, parent,
  pool or lane when that side moved the container, or when its own side draws it on
  another plane (a collapsed sub-process), and a flow follows its ends when one of them had
  to.

### Building the file

`buildMerged(sources, decisions)` refuses open conflicts and builds the file on a fresh
parse of current, which keeps everything outside the merge elements (current's label
styles, the `definitions` extensions and imports). Building a fresh tree would have to copy
each of those.

- *The caller owns what builds share.* `prepareMergeSources(versions)` runs
  `requireMergeableVersions`, so it refuses what `computeMerge` refuses, then parses each
  version once (its snapshots, its frame, the shared moddle, the version keys); the
  merge view keeps that value for the session and passes it to every build, so a preview
  per pick does not parse the versions again. `buildMerged` refuses sources whose version
  keys differ from the result's, naming each such version, before it parses anything: the
  ids alone miss a version whose content changed, which would build without that change. On the 800 KB `large-c8.bpmn` a build takes
  about 290 ms with the sources reused and 630 ms when it prepares them itself. A cache
  keyed by the versions object did the same out of sight: a caller that copied the object
  lost it, and one that changed it relied on a string guard.

- *Same parse as the modeler's save.* Current and incoming are parsed with current's
  engine descriptor and one prefix map built from all versions, current first, and
  written with `toXML({ format: true })`. Without the shared map, two sides using one
  prefix for different namespaces swap silently, and an attribute whose namespace only
  incoming declares is dropped; moddle-xml then declares every prefix it writes.
- *Elements move whole.* Each element is taken from its side as written, unknown
  extensions included, and placed in the collection its side used; incoming-only elements
  go after the sibling they followed. References inside a moved element still point at
  the other tree's objects and serialise by id.
- *The frame is three-way.* Each `definitions` attribute takes incoming's value when only
  incoming changed it and current's otherwise; without a base, current's. Which attributes
  are typed comes from the loaded descriptors, so an engine's extension of
  `bpmn:Definitions` (Camunda 7's `diagramRelationId`) counts like `exporterVersion`.
- *Diagrams by what they draw.* One root diagram for the collaboration and the processes
  its participants name, under current's ids, and one per collapsed sub-process. The root
  diagram is a collaboration's only while the result keeps one of its pools, since bpmn-js
  draws from a collaboration's plane only what its pools reach. Drawings take their layout
  side's DI unchanged and go on the plane their sub-process implies, as bpmn-js reads it:
  its own plane when it has one and its shape is not expanded, otherwise its shape's
  plane. The build and the check share that one rule. An edge's `sourceElement` and
  `targetElement` point at the result's drawings.
- *Drawn parts follow their element.* A part bpmn-js draws (a process's data input) takes
  its drawing from its element's layout side, else from the side the element is taken
  from, and is not drawn when neither draws it or the chosen version does not hold it.
- *DI ids are not merged.* Drawings are ordered by the element they draw. A diagram, plane,
  drawing or label style of incoming whose id the result already uses gets an unused one
  (`<element>_di`, else a numbered suffix), keeping its place. A label style an incoming
  drawing uses joins that drawing's diagram, unless the result holds the same style under
  its id.
- *Derived references are rebuilt, never merged:* `incoming` and `outgoing` from the
  flows, `flowNodeRef` from each element's chosen lanes; `boundaryEventRefs` is only
  shortened to the boundary events still attached, since bpmn-js never writes it. Stale
  ones parse without a warning, so nothing else would notice.
- *Refused, not repaired.* Before it returns, a fresh parse of the result must give no
  warning at all, every drawn element and part must have exactly one shape or edge on the
  plane its container implies, every drawing on a root plane must be reachable from the
  plane's owner as bpmn-js walks it (a process's contents; a collaboration's own elements,
  the processes its pools name and any process with lanes), the derived references must list the rebuilt ids, each as often, in
  any order, and every element's compared text, parent and lanes must equal its source
  side's, which catches dropped attributes and namespace swaps. Lanes are listed outermost
  first, so the classification, the layout side and the check all compare them in order.
- *Notes for the reviewer:* a flow whose layout and its ends' layouts come from different
  sides, an element drawn from another side than its container, elements both sides added
  at the same place, an element kept against the other side's removal whose boundary events
  removed with it, or flows on its own side, stay out (`restoredWithoutRemovedWith`; each is
  decided on its own, so what was removed with it stays removed unless `pickWithRemoved` kept
  it, and the element may be left unconnected or without its timer), a kept
  flow no longer its source's default (`defaultFlowNotRestored`), elements the base and both
  sides draw, each side differently (`layoutChangedByBoth`), and every frame difference the
  result does not carry (attributes both sides changed, incoming's extensions or imports).
- *A layout both sides changed differently is a note, not a conflict, one per moved block
  and kept side.* Rejected: one note per element, which floods the notes for one moved
  block. Lanes join no block, since one lane can hold most of a diagram. A flow drawn from
  another side than one of its ends gets only the flow-ends note, so two people moving its
  two ends do not note it twice. Without a base there is none, as every element the sides
  draw differently would get one.

## Consequences

- An all-current or all-incoming merge equals that side element by element and under
  `computeDiff`, except where the layout rules draw an element from the other side and
  where the shared prefix map renames an incoming prefix. `everyPick.spec.ts` builds every
  end state reached by picking the open conflicts, and each of those with one automatic
  resolution overridden, and requires a valid file. `mergeFuzz.spec.ts` does the same for
  a few end states and random walks of 200 seeded random triples of the order process and
  a few pinned seeds. After every applied step it checks that each pick sits on its side
  and every open conflict has a choice that applies; it also checks that a refused pick
  changes nothing and that the picks, not their order, decide. The fixtures are generated
  from a plain model and equal a moddle round trip, so "what the save writes" is testable.
- An element drawn from another side than its container keeps that side's coordinates; the
  build notes it but does not move it.
- bpmn-js rewrites the diagram's plane order on every save; the build keeps current's
  order, so opening and saving a merged file can reorder `bpmndi` without changing the
  model.
- References held in plain strings are invisible to the rules and the checks: link events
  pair by name, a Camunda 8 embedded form names its `zeebe:userTaskForm`, and the
  classification parses without engine descriptors, so engine extension references stay
  generic. `computeDiff` does not see a change to an element without an id.
- The reference rules read a reference's property as `owner#property`, the text
  `bpmn-diff` writes into its snapshot; `referenceRules.ts` is the one reader, and a
  change to the format is a change to both libraries.
- `content` and `layout` are opaque texts, only fit for equality; the view cannot say what
  changed inside an element without its text.
- The build relies on moddle-xml's undocumented `nsMap` (see
  [dependencies](dependencies.md#private-upstream-apis)) and on bpmn-js's append order for
  derived references; the content check turns a change in either into a refused build.
