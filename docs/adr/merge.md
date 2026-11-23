# Merge

- Status: proposed
- Last reviewed: 2026-11-23

## Context

A Git conflict in a BPMN file leaves conflict markers in XML that the modeler cannot open.
The merge resolves it on the model: Git's three index stages (base, current, incoming) are
classified element by element, the user decides what is left, and one valid file is built.
Epic #2459 keeps the merge in VS Code first and out of the published packages. This record
covers the data library up to the decisions; building the file from them, the result's broken
drawing spots and flow repair, the view that shows a conflict as diagrams and the line-wise XML
merge in VS Code's merge editor have records of their own ([merge build](merge-build.md),
[merge layout](merge-layout.md), [merge view](merge-view.md),
[merge view picking and building](merge-view-picking-and-building.md),
[merge XML editor](merge-xml-editor.md)).

## Decision

### One unpublished library

`libs/bpmn-merge` (`@miragon/bpmn-modeler-merge`, hexagonal, DOM-free like `libs/bpmn-diff`)
holds `computeMerge`, `MergeDecisions` and `buildMerged`. It is not in `libs/bpmn-diff`,
because the diff result is a semver contract of `@miragon/bpmn-modeler/diff` and the merge is
not published; `.github/release-lines.json` ships the workspace on the hosts only, not on the npm line.
It depends on `bpmn-diff` for the parse, the element text and the reference walk, so both
share one notion of an element's XML: besides `elementSnapshots`, `bpmn-diff` exports its
moddle walk, the unit rule `trackedElementOf`, its namespace reading and its parse, so the
merge applies them instead of copying them. The cost is a wider workspace API: a change to
one of them is a change to the merge. `@miragon/bpmn-modeler/diff` re-exports none of them.
The library depends on `@miragon/bpmn-modeler-types/engine` for the modeler's engine rule and
on `@miragon/bpmn-modeler-types/polyline` for the waypoint walk, so a fix to the segment
arithmetic reaches the merge's layout too. It imports those subpaths, not the barrel, which
would pull DOM-typed modules into a DOM-free library.

The core imports it, so its consumers' TypeScript `lib` (`ES2021`, `tsconfig.base.json`)
binds it too: it calls no ES2022 or later library API (`findLast`, `Object.hasOwn`, an
`Error`'s `cause` option), and its own tsconfig compiles with `lib: ["ES2021"]` so the next
one fails its build. Rejected: raising `lib` in the core, the bridge and the plugin, three
consumers for five call sites.

The core, the protocol and the merge view's webview share one vocabulary (the sides, the
markers a pane paints, the caption roles) in `libs/modeler-types/src/mergeVocabulary.ts`; the
library reaches it through the `@miragon/bpmn-modeler-types/mergeVocabulary` subpath,
everything else through the barrel, whose exact specifier is the only one the core's `domain/`
may import. Beside it sit Git's conflict-marker grammar (`/conflictMarkers`), so the core's file
check and the hand-merge check read markers alike, as a second grammar had drifted, and the
build's notes (`/mergeBuildNotes`, types only, with their readers in `/mergeBuildNoteReaders`),
which the library builds, derives its repairs from, and the protocol carries as they are.
Rejected: a protocol copy pinned to the library's type (two edits per note), and the protocol
importing the unpublished library. Each subpath file imports
nothing at runtime; `domFreeEntries.spec.ts` reads the subpaths from `tsconfig.base.json`.

`libs/modeler-types` is inlined into the npm package and ships on every release line, so no
path keeps these files out of the npm changelog: a merge-view change ticks only the lines that
offer the merge view ([release lines](release-and-publishing.md#release-lines-and-attribution)).
Cost: the published barrel carries the vocabulary and the notes, which no package entry uses.

### Stages

Decided 2026-11-23 (#2562, A8 and B9): the library sorts its files into stage folders with
`domain/` (the rules) and `service/` (what parses or writes XML, which awaits and so stays out of
`domain/`) inside, and no `port/` or `adapter/`, as it does no I/O.

| Folder | Holds |
| --- | --- |
| `kernel/` | the result's vocabulary, what a merge element is, `hasNoShape`, the member order of two sides |
| `classify/` | the versions, their refusals and fingerprints, `computeMerge` |
| `decide/` | `MergeDecisions`, the reference rules, pick outcomes, the hand-merged versions it keeps |
| `sources/` | `prepareMergeSources`, `MergeSources`, the merge's moddle, an element text's cut, parse and splice |
| `build/` | `buildMerged`, its checks and notes, the merged tree and diagrams, `acceptHandMerge`; the layout repair in `build/domain/layout/` |
| `project/` | what a merge view shows, as pure projections ([why](merge-view.md)): `mergePaneView`, `mergePaneSteps`, `mergeNavigationOrder`, `mergeElementNames` |

A stage imports `kernel/` and the stages before it in the table's order; `build` and `project`
read the same stages and not each other. The order is of imports, not calls: the sources read
decide's hand-merge scope. `architecture.spec.ts` checks it and, as the core's does, that
`domain/` imports only pure modules. The sources are a stage because the projections and a hand
merge read the parsed versions, not the built file; the layout repair stays in `build/` because
each reads the other's model.

- **Why:** the checks that read the core read the library too; its file prefixes did the work of
  folders, and no rule kept the projections out of the build.
- **Domain entry:** the root barrel re-exports `service/` modules and is not pure, so
  `src/domain.ts` (`@miragon/bpmn-modeler-merge/domain`, a `tsconfig.base.json` alias) re-exports
  the `domain/` modules the core's `domain/` imports, and no more, as knip reports unused exports.
  The library's own `domain/` imports `@miragon/bpmn-modeler-diff/domain` for the same reason
  ([library folders](diff.md#library-folders)).
- **Cost:** synchronous rules beside the parse they need, or inline in the function that awaits
  it, stay in `service/` files (`mergeVersions.ts`, `buildChecks.ts`, `handMergeText.ts`,
  `handMergeTexts.ts`, `buildMergedSources.ts`, `buildMerged.ts` and `acceptHandMerge.ts`), and
  no rule finds them (#2730).

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
- *Layout side.* Current's DI, unless only incoming changed the layout. Where both changed it,
  the DI of the side that re-laid out the diagram, when one did: it moved or resized more than
  half of the shapes the base and both sides draw, and more of them than the other side
  (#2738). A colour, a label or a flow is no move, as the bounds of an element's shapes alone
  decide (`moved`, read by `diagramLayouts`); counting the whole DI let a side that only
  recoloured the diagram lead. Rejected:
  current's DI throughout, which tore a re-laid-out diagram between two frames, the elements
  both moved in current's and the rest in incoming's; composing both sides' moves, which no
  drawing either side made would match. Cost: the smaller side's moves of elements the leader
  moved too are dropped, and the notes name them; without a base no side leads. An element is drawn
  from its own side when the preferred side does not draw it, or draws it in another
  parent, lane, host or between other ends, since bpmn-js reads lane membership and
  attachment from geometry, and from the other side when neither draws it in place: a
  process one side drew only through a pool the result drops takes the other side's
  plane, unless a pool of the result draws it. A process no pool names (one with lanes, or
  one only a participant without an id names) is drawn by a side whose collaboration's plane
  holds a shape or edge of something inside it, though the process has no plane there, so the
  other side's diagram of it neither takes its lanes nor stays behind empty (#2719). A side
  that keeps the collaboration's plane but draws nothing of the process does not draw it, or
  its lanes would land on the pools. `VersionSnapshots` reads this from the side's snapshots. A pool
  and the lanes of its process take one side, chosen from all their layouts as for one element, or the other side when only that one
  draws no lane the result leaves out; lanes are stacked, and lanes from both sides overlapped
  (28 times on the #2565 harvest). A lane follows no container, and one that side does not
  draw in place is stacked below the others unless they already hold it
  ([merge layout](merge-layout.md)). Containers
  settle first: an element follows its host, parent, pool or lane when that side moved the
  container, or when its own side draws it on another plane (a collapsed sub-process, or the
  root plane of a collaboration the result drops; two root planes it keeps are one), and a
  flow follows its ends when one of them had to. Cost: a lane only the other side resized
  takes the block side's band, so a member that side moved may lie outside it until the build
  brings it in.

### Versions merged by hand

A picked element that base, current and incoming hold as one type, with texts that all
differ, can take a version merged by hand from those texts (#2457); the
[merge XML editor](merge-xml-editor.md) record covers the editor, this library checks and
keeps the version. A type that differs leaves nothing to merge, since no text may change it.
An accept names the side the text was merged for and is refused once the pick has moved.

- *I1, it lives on its pick.* It stands only while its element stays picked on its side. A
  pick or unpick that would move it off that side, an ancestor's keep-inside from the other
  side included, returns `handMergesAtStake` and changes nothing unless the caller passes
  `dropHandMerges`; a refused call drops nothing, and a pick of the same side keeps it. So a
  view can ask before the text is lost, and nothing outlives the picks it rests on.
- *I2, one effective result.* `MergeDecisions.result` holds each hand-merged version in place
  of its side's, and every rule, projection and the build read that one list.
- *I3, an accept changes no other decision.* `mergeByHand` refuses a version that names an
  element the result leaves out, or whose trial closure would pull in, drop or reopen
  anything: what the text names must already be in the result, of the type its property
  takes. A name the result keeps from the other side is met, since a requirement asks for
  presence, not a side.
- *I4, structure follows the pick.* Parent, container, lanes, edge ends, host and process
  stay the picked side's. A container's text (sub-process, pool, lane, process,
  collaboration) covers only its start tag, documentation and extension elements, so its
  children, lane sets and ioSpecification follow the pick; no text holds an element of its own,
  one without an id included. The version keeps the text as shown, which a reopened editor
  starts from.
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

## Consequences

- An all-current or all-incoming merge equals that side element by element and under
  `computeDiff`, except where the layout rules draw an element from the other side and
  where the [shared prefix map](merge-build.md#decision) renames an incoming prefix. `everyPick.spec.ts` builds every
  end state the picks reach, and each with one automatic resolution overridden;
  `mergeFuzz.spec.ts` walks 200 seeded random triples and checks after every step that each
  pick sits on its side, every open conflict has a choice, a refused pick changes nothing and
  the picks, not their order, decide. The fixtures equal a moddle round trip, so "what the
  save writes" is testable.
- References held in plain strings are invisible to the rules and the checks: link events
  pair by name, a Camunda 8 embedded form names its `zeebe:userTaskForm`, and the
  classification parses without engine descriptors, so engine extension references stay
  generic. `computeDiff` does not see a change to an element without an id.
- The reference rules read a reference's property as `owner#property`, the text
  `bpmn-diff` writes into its snapshot; `referenceRules.ts` is the one reader, and a
  change to the format is a change to both libraries.
- `content` and `layout` are opaque texts, only fit for equality; the view cannot say what
  changed inside an element without its text.
