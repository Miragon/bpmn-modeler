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

The core, the protocol and the merge view's webview share one vocabulary (the sides, the
markers a pane paints, the caption roles) in `libs/modeler-types/src/mergeVocabulary.ts`, which
imports nothing at runtime; the library reaches it through the
`@miragon/bpmn-modeler-types/mergeVocabulary` subpath, everything else through the barrel,
whose exact specifier is the only one the core's `domain/` may import. Git's conflict-marker
grammar sits beside it in `conflictMarkers.ts` (subpath `/conflictMarkers`) for the same
reason: the core reads a file's markers and the library refuses a hand-merged text that still
holds them, and a second grammar had already drifted from the first.

`libs/modeler-types` and `libs/bpmn-i18n-extras` are inlined into the npm package, so the
vocabulary file is excluded from the npm component by path like this library, and the merge
view's other edits there land in `chore` changes, so it adds no npm changelog entry. Cost: a
published file that later imports the vocabulary is not excluded, and the published barrel
carries the vocabulary although no package entry re-exports it.

### Merge elements

The merge decides on its own set of elements, `isMergeElement`: what the diff tracks as
itself, plus every root element (message, error, signal, escalation, data store, item
definition, category, interface and the rest), the process, text annotations, associations,
groups and data objects. The diff folds these into their participant, which would make two
unrelated annotation edits a conflict on the pool, and it does not track root elements at
all, although event definitions and operations name them. Event definitions,
`ioSpecification`, lane sets, labels and extension elements stay part of their element.

- *Elements are matched by id, and only an element with an id stands on its own.* An
  element deleted and drawn again shows as removed and added. A child without an id, such
  as a data association some exporters write, stays inside its merge element, so a change
  to it is never lost. A root element or a lane without an id has no element to stay in,
  so a version holding one is refused, naming the side and the type.
- *One parse per version.* `elementSnapshots(xml, { isUnit, prefixSources, rejectWarnings })`
  in `bpmn-diff` returns every element's text, structure, parts, plane and layout from one
  parse and shares its serialiser with `elementXml`, so the default unit rule gives the same text.

### Classification

`computeMerge({ base?, current, incoming })` gives each element one state from the three
versions. The fourteen states with a base are the table in #2450; four of them are
conflicts: both changed, both added, removed and changed, changed and removed. Without a
base, an element only one side has, or that the sides hold differently, is a conflict.

- *Only clean versions.* A version that parses with any warning is refused, naming it:
  moddle drops an unresolved reference with nothing but a warning. It is parsed a second
  time with the merge's engine descriptor (current's engine, else incoming's), which builds
  the file, so an engine attribute it does not know is refused too. `requireMergeableVersions`
  holds every up-front refusal; it throws a typed `MergeRefusal`, which `mergeRefusalOf`
  reads so a caller explains each in its own words. Any other error thrown is a bug.
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
  resolves, found by a generic walk over the descriptors' references. A reference or
  container inside another element (a data association's target property, a lane's lane
  set) also needs that element's chosen version to hold the part.
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
  and a view in another locale replaces it. `unpick` returns an element nothing else needs
  to its automatic resolution or to open, the way out of two picks that name each other.
- *Keeping a removed element offers its flows and boundary events.* A pick that keeps an
  element the other side removed returns `connectionsLeftOut` and `boundaryEventsLeftOut`
  (`removedWithLeftOut`): the boundary events its side attaches to it and the flows its side
  connects to it or to them, that the other side removed with it, that nobody decided and
  the pick still leaves out, each only if all it requires besides the element and the
  offered boundary events stays in the result, so the offer brings back nothing the user did
  not ask for. `pickWithRemoved` picks them with the element in one closure, so it is
  refused as a whole and equals the plain picks; flows and boundary events are dependents,
  not requirements, so they never come back as a consequence. The library keeps no groups:
  `mergePaneView` rebuilds a pick's reach from the picks alone. A container counts as kept
  with everything inside only while every element inside is picked on its side, and an
  element as kept with its flows only while one of them is picked and none it could keep is
  left out, so any order of the same picks shows the same badges and Undo takes back no pick
  the user made apart. Only
  a sub-process, pool, lane, process or collaboration offers everything inside; a task holds
  its data associations but offers only itself. [Picking and building](merge-view-picking-and-building.md#picking)
  covers what the offer leaves out and the build note on it; [building](merge-view-picking-and-building.md#building) a kept flow's `default`.
- *Consequences follow the picks, not their order.* The state is the user's picks and the
  versions merged by hand on them (below): each pick or unpick derives every consequence
  again from them over the automatic resolutions. Picking an element back, or unpicking it,
  restores what its first pick dropped, pulled in or settled, so no addition is lost and no
  closed conflict stays closed on its own; a sequence of picks and its final picks made on a
  fresh merge agree (`mergeDecisionsPathIndependence.spec.ts`). The cost is one closure over
  all picks per call, plus a pass for clashes and dead ends; and a pick can reopen an
  element the user did not touch, which then waits for its own choice.
- *Layout side.* Current's DI, unless only incoming changed the layout. An element is drawn
  from its own side when the preferred side does not draw it, or draws it in another
  parent, lane, host or between other ends, since bpmn-js reads lane membership and
  attachment from geometry, and from the other side when neither draws it in place: a
  process one side drew only through a pool the result drops takes the other side's
  plane, unless a pool of the result draws it. Containers settle first: an element follows its host, parent,
  pool or lane when that side moved the container, or when its own side draws it on
  another plane (a collapsed sub-process), and a flow follows its ends when one of them had
  to.

  to. Containers settle first: an element follows its host, parent,
  pool or lane when that side moved the container, or when its own side draws it on
  another plane (a collapsed sub-process), and a flow follows its ends when one of them had
  to.

### Versions merged by hand

A picked element whose base, current and incoming texts all differ can take a version merged
by hand from those texts (#2457); the [merge XML editor](merge-xml-editor.md) record covers
the editor, this library checks and keeps the version.

- *I1, it lives on its pick.* It stands only while its element stays picked on its side. A
  pick or unpick that would move it off that side, an ancestor's keep-inside from the other
  side included, returns `handMergesAtStake` and changes nothing unless the caller passes
  `dropHandMerges`; a refused call drops nothing, and a pick of the same side keeps it. So a
  view can ask before the text is lost, and nothing outlives the picks it rests on.
- *I2, one effective result.* `MergeDecisions.result` holds each hand-merged version in place
  of its side's, and every rule, projection and the build read that one list.
- *I3, an accept changes no other decision.* `mergeByHand` refuses a version that names an
  element the result leaves out, or whose trial closure would pull in, drop or reopen
  anything: what the text names must already be in the result. A name the result keeps from
  the other side is met, since a requirement asks for presence, not a side.
- *I4, structure follows the pick.* Parent, container, lanes, edge ends, host and process
  stay the picked side's. A container's text (sub-process, pool, lane, process,
  collaboration) covers only its start tag, documentation and extension elements, so its
  children, lane sets and ioSpecification follow the pick; no text holds an element of its own.
- *I5, back to the plain pick.* A text that writes the picked side's own version drops it.
- *Refusals are data.* `HandMergeRefusal` is a closed union, one kind per reason, returned and
  never thrown, with an English `describeHandMergeRefusal` a view replaces, as for
  `UnmetRequirement`.
- *Checked as the build writes it.* The text is spliced into the side's element parsed from
  its snapshot, written under the engine's descriptor and read back as `elementSnapshots`
  reads an element, which gives the version's text, references and parts; writing that once
  more must not change it. `prepareMergeSources` computes the texts once, parsing the base
  once more. Rejected: reading the version from the whole spliced side, which drops a
  reference to an element only the other side holds, and grafting the text's own parse in
  place of the element, which leaves the diagram and other references on the old object.
  Cost: an element read alone must read as in its document; `handMergeRoundTrip.spec.ts`
  builds every scenario's three-version elements from their own texts byte for byte.

### Building the file

`buildMerged(sources, decisions)` refuses open conflicts and builds the file on a fresh
parse of current, which keeps everything outside the merge elements (current's label
styles, the `definitions` extensions and imports). Building a fresh tree would have to copy
each of those.

- *The caller owns what builds share.* `prepareMergeSources(versions)` refuses what
  `computeMerge` refuses, then parses each version once; the merge view keeps that value
  for the session and passes it to every build, so a preview per pick parses no version
  again. `buildMerged` refuses sources whose version keys differ from the result's, naming
  each such version: the ids alone miss a version whose content changed. Rejected: a cache
  keyed by the versions object, which a caller that copied the object lost and one that
  changed it fooled.
- *Same parse as the modeler's save.* Current and incoming are parsed with current's
  engine descriptor and one prefix map built from all versions, current first, and
  written with `toXML({ format: true })`. Without the shared map, two sides using one
  prefix for different namespaces swap silently, and an attribute whose namespace only
  incoming declares is dropped; moddle-xml then declares every prefix it writes.
- *Spliced, then moved whole.* A version merged by hand is spliced into its side's element in
  place before the trees are taken apart, so the diagram and every reference keep the same
  object. Each element is then taken from its side as written, unknown extensions included,
  and placed in the collection its side used; incoming-only elements go after the sibling
  they followed. References inside a moved element still point at the other tree's objects
  and serialise by id.
- *The frame is three-way.* Each `definitions` attribute takes incoming's value when only
  incoming changed it and current's otherwise; without a base, current's. Which attributes
  are typed comes from the loaded descriptors, so an engine's extension of
  `bpmn:Definitions` (Camunda 7's `diagramRelationId`) counts like `exporterVersion`.
- *Diagrams by what they draw.* One root diagram for the collaboration and the processes
  its participants name, a collaboration's only while the result keeps one of its pools,
  and one per collapsed sub-process. Drawings take their layout side's DI unchanged and go
  on the plane their sub-process implies as bpmn-js reads it (its own plane when it has one
  and its shape is not expanded); the build and the check share that one rule.
- *Drawn parts follow their element.* A part bpmn-js draws (a process's data input) takes
  its drawing from its element's layout side, else from the side the element is taken
  from, and is not drawn when neither draws it or the chosen version does not hold it.
- *DI ids are not merged.* Drawings are ordered by the element they draw; an incoming DI
  id the result already uses gets an unused one, and a label style an incoming drawing uses
  joins its diagram unless the result holds the same style.
- *Derived references are rebuilt, never merged:* `incoming` and `outgoing` from the
  flows, `flowNodeRef` from each element's chosen lanes; `boundaryEventRefs` is only
  shortened to the boundary events still attached, since bpmn-js never writes it. Stale
  ones parse without a warning, so nothing else would notice.
- *Refused, not repaired.* Before it returns, a fresh parse of the result must give no
  warning, every drawn element and part exactly one shape or edge on the plane its
  container implies, every drawing on a root plane must be reachable from the plane's owner
  as bpmn-js walks it, the derived references must list the rebuilt ids, each as often, and
  every element's compared text, parent and lanes must equal its source side's (its
  hand-merged text where it has one), which catches dropped attributes and namespace swaps.
  Lanes are listed outermost first, so every comparison takes them in order.
- *Notes for the reviewer:* a flow drawn from another side than its ends, an element drawn
  from another side than its container, elements both sides added at the same place, an
  element kept against a removal whose boundary events or flows removed with it stay out
  (`restoredWithoutRemovedWith`; each is decided on its own), a kept flow no longer its
  source's default, elements the base and both sides draw differently, and every frame
  difference the result does not carry.
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
  end state the picks reach, and each with one automatic resolution overridden;
  `mergeFuzz.spec.ts` walks 200 seeded random triples and checks after every step that each
  pick sits on its side, every open conflict has a choice, a refused pick changes nothing and
  the picks, not their order, decide. The fixtures equal a moddle round trip, so "what the
  save writes" is testable.
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
