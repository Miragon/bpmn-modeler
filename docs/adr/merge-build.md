# Merge build

- Status: proposed
- Last reviewed: 2026-11-20

## Context

The [merge](merge.md) library decides element by element what a three-way BPMN merge keeps;
`buildMerged(sources, decisions)` turns those decisions into one file the modeler opens and
saves like any other. This record covers what the build parses, how it puts the sides' elements
and drawings together, what it checks before it returns and what it tells the reviewer. The
drawing's broken spots and their repair are in [merge layout](merge-layout.md); how the merge
view runs a build and writes the working file is in
[merge view picking and building](merge-view-picking-and-building.md#building) (epic #2459).

## Decision

`buildMerged` refuses open conflicts and builds the file on a fresh parse of current, which
keeps everything outside the merge elements (current's label styles, the `definitions`
extensions and imports). Building a fresh tree would have to copy each of those.

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
  incoming declares is dropped.
- *Spliced, then moved whole.* A [version merged by hand](merge.md#versions-merged-by-hand) is
  spliced into its side's element in place before the trees are taken apart, so the diagram and
  every reference keep the same object; what the hand merges bring in is resolved first, so one
  may name a part another adds. Each element is then taken from its side as written, unknown
  extensions included, and placed in the collection its side used; incoming-only elements go
  after the sibling they followed. References inside a moved element still point at the other
  tree's objects and serialise by id.
- *The frame is three-way.* Each `definitions` attribute takes incoming's value when only
  incoming changed it and current's otherwise; without a base, current's. The loaded
  descriptors say which attributes are typed, so an engine's extension of `bpmn:Definitions`
  (Camunda 7's `diagramRelationId`) counts like `exporterVersion`.
- *Diagrams by what they draw.* One root diagram for the collaboration and the processes its
  participants name, a collaboration's only while the result keeps one of its pools, and one
  per collapsed sub-process. Drawings take their [layout
  side](merge.md#decisions-and-reference-rules)'s DI unchanged, but for the shapes the build
  moves and the flows it re-routes. A shape goes on the plane its sub-process implies as
  bpmn-js reads it (its own plane when it has one and its shape is not expanded); an edge goes
  on the plane that draws both its ends, as bpmn-js joins them (a data association to the
  activity holding it), so a data input of a collapsed sub-process lies beside the
  sub-process's shape, not inside it. An edge whose ends no plane draws together (one side
  moved a task into a sub-process the other collapsed) is left out of the drawing with a note
  rather than written where bpmn-js cannot draw it; its element stays in the model, where the
  modeler cannot show it, so the user removes or reconnects it in the XML. The build and the
  check share both rules.
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
  warning, every drawn element and part exactly one shape or edge, each shape on the plane
  its container implies and each edge on the plane of both its ends, every drawing on a root
  plane reachable from the plane's owner as bpmn-js walks it, the derived references the
  rebuilt ids, each as often, and every element's compared text, parent and lanes its source
  side's (its hand-merged text where it has one), which catches dropped attributes and
  namespace swaps. Lanes are listed outermost first, so every comparison takes them in order.
- *Notes for the reviewer:* each broken spot of the drawing, an element kept against a
  removal whose boundary events or flows removed with it stay out
  (`restoredWithoutRemovedWith`; each is decided on its own), a kept flow no longer its
  source's default, elements the base and both sides draw differently, every frame
  difference the result does not carry, and each flow left out of the drawing
  (`flowNotDrawn`). Each note carries the elements it names (`named`, from `elementsNamedBy`
  beside the note type, which a webview spec holds the note's text to). The build specs read
  `elementsRedrawnBy`, a subset of `named` that a spec checks and the one other place a
  repair's new field goes.
  Rejected: a switch per reader, which had to change with every new field while nothing
  checked that they agreed. Cost: a note carries its ids twice.

## Consequences

- bpmn-js rewrites the diagram's plane order on every save; the build keeps current's
  order, so opening and saving a merged file can reorder `bpmndi` without changing the
  model.
- The build relies on moddle-xml's undocumented `nsMap` (see
  [dependencies](dependencies.md#private-upstream-apis)) and on bpmn-js's append order for
  derived references; the content check turns a change in either into a refused build.
