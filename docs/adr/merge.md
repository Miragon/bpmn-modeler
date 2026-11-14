# Merge

- Status: proposed
- Last reviewed: 2026-11-14

## Context

A Git conflict in a BPMN file leaves conflict markers in XML that the modeler cannot open.
The merge resolves it on the model: Git's three index stages (base, current, incoming) are
classified element by element, the user decides what is left, and one valid file is built.
Epic #2459 keeps the merge in VS Code first and out of the published packages. This record
covers the data library; the merge view gets its own section when it is built.

## Decision

### One unpublished library

`libs/bpmn-merge` (`@miragon/bpmn-modeler-merge`, flat, DOM-free like `libs/bpmn-diff`)
holds `computeMerge`; the decisions (#2451) and building the file (#2452) come next. It is not in `libs/bpmn-diff`,
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
  without an id, such as a data association some exporters write, stays inside its
  enclosing element, in `elementSnapshots` and in `elementXml` alike, so a change to it is a
  change of that element and never lost.
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
  webview boundary; texts are fetched on demand.
- *Engines.* The modeler's one rule, `detectEngineWithNamespaceFallback`
  (`modeler:executionPlatform`, then the version, then the Camunda 7 or 8 namespace on the
  definitions root), names each side's engine. Detected engines must agree; a side without
  one merges with either, since a save drops an engine namespace nothing uses.

## Consequences

- References held in plain strings are invisible to the classification: link events
  pair by name, a Camunda 8 embedded form names its `zeebe:userTaskForm`, and the
  classification parses without engine descriptors, so engine extension references stay
  generic. `computeDiff` does not see a change to an element without an id.
- `content` and `layout` are opaque texts, only fit for equality; the view cannot say what
  changed inside an element without its text.
