# Merge

- Status: proposed
- Last reviewed: 2026-11-15

## Context

A Git conflict in a BPMN file leaves conflict markers in XML that the modeler cannot open.
The merge resolves it on the model: Git's three index stages (base, current, incoming) are
classified element by element, the user decides what is left, and one valid file is built.
Epic #2459 keeps the merge in VS Code first and out of the published packages. This record
covers the data library; the merge view gets its own section when it is built.

## Decision

### One unpublished library

`libs/bpmn-merge` (`@miragon/bpmn-modeler-merge`, flat, DOM-free like `libs/bpmn-diff`)
holds `computeMerge` and `MergeDecisions`; building the file (#2452) comes next. It is not in `libs/bpmn-diff`,
because the diff result is a semver contract of `@miragon/bpmn-modeler/diff` and the merge is
not published; `release-please-config.json` excludes the workspace from the npm component.
It depends on `bpmn-diff` for the parse, the element text and the reference walk, so both
share one notion of an element's XML, and on `@miragon/bpmn-modeler-types/engine` for the
modeler's engine rule. It imports that subpath, not the barrel, which would pull DOM-typed
modules into a DOM-free library.

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
  same checks.
- *What a state compares.* The element's text without its child elements, `bpmndi` and
  the derived references `incoming`, `outgoing`, `flowNodeRef` and `boundaryEventRefs`,
  together with its parent and its lanes. Keeping derived references would make both ends
  of an added flow look changed, and any edit to them a conflict. An element moved into
  another sub-process or lane is changed; a lane itself does not change when its members
  do.
- *Layout apart from content.* Bounds, waypoints, labels and DI attributes are classified
  on their own and are never a conflict: when both sides changed them, or there is no
  base, current's win. DI references are compared by what they draw, never by DI ids.
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
  overrides it. `unpick` takes a pick back; an element nothing else needs returns to its
  automatic resolution or to open, which is the way out of two picks that name each other.
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

## Consequences

- References held in plain strings are invisible to the reference rules: link events
  pair by name, a Camunda 8 embedded form names its `zeebe:userTaskForm`, and the
  classification parses without engine descriptors, so engine extension references stay
  generic. `computeDiff` does not see a change to an element without an id.
- The reference rules read a reference's property as `owner#property`, the text
  `bpmn-diff` writes into its snapshot; `referenceRules.ts` is the one reader, and a
  change to the format is a change to both libraries.
- `content` and `layout` are opaque texts, only fit for equality; the view cannot say what
  changed inside an element without its text.
