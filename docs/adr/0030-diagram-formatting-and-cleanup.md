# 0030 — Diagram formatting and cleanup: wrap bpmn-auto-layout behind a geometry-only port

- Status: accepted
- Date: 2026-09-08
- Category: bpmn-webview

## Context

The modeler has no layout automation. The only geometry it has ever written is
`alignElementsToOrigin()`, which translates the whole graph and nothing else,
so an imported, generated or long-grown diagram has to be tidied by hand. The
feature asked for is the modeler's equivalent of *Reformat Code*: arrange the
process left to right, route the connections, and separately remove the
leftovers a long editing history accumulates.

Building a layered graph layout (cycle breaking, layer assignment, crossing
minimisation, coordinate assignment, orthogonal routing) is weeks of work and
holds a high quality bar, because users compare the result against hand-drawn
diagrams. `bpmn-auto-layout` — from bpmn-io, the authors of bpmn-js — already
does it.

That library has two very different faces, and the distinction decides the
scope of this feature:

- `latest` (1.3.0) is a grid layouter. `layoutProcess(xml)` returns a bare
  string with no diagnostics, and `getProcess()` takes the *first*
  `bpmn:Process` — so on a collaboration it destroys all participant, lane and
  message-flow DI. Artifacts, groups and associations receive no DI at all;
  `createDiLabel()` exists but is never called.
- `next` (2.0.0-alpha.2) is a full rewrite to semantic BPMN layout, with
  collaboration pools, lanes, message flows, artifacts, groups, labels and
  visibility-graph routing, returning `{ xml, warnings }`.

Two properties hold in both: the engine clears `definitions.diagrams` and
rebuilds DI from scratch (a greenfield relayout, not an incremental tidy-up),
and `layoutProcess` accepts no options — every spacing value is a module
constant.

## Decision

**Wrap `bpmn-auto-layout` 2.0.0-alpha.2, pinned exactly, behind a
`LayoutEngine` port that speaks pure geometry and never XML.** The port returns
absolute shape bounds and connection waypoints.

This containment is the load-bearing property of the design, not merely a
swappability convenience: because the applier *reads* geometry rather than
writing the engine's XML back into the document, everything the engine omits,
forgets or mishandles simply keeps the DI it already has. The engine's
destructiveness cannot escape the adapter.

**Apply the result through `modeling.*` from the `preExecute` of a single
`layout.apply` command handler.** diagram-js's `CommandStack` assigns
`action.id = (baseAction && baseAction.id) || this._createId()`, and `undo()`
loops while the ids match, so nested commands collapse into one undo entry.
There is no `importXML` round trip, which would reset the command stack and
destroy undo. Four bpmn-js behaviours must be suppressed by hint —
`MoveShapeHandler`'s child recursion and connection re-layout, `AttachSupport`
on resize, and `AdaptiveLabelPositioningBehavior` on waypoint updates.

**The refusal taxonomy is ours.** A pre-flight check decides what may be
formatted (`UNSUPPORTED_SURFACE`, `UNSUPPORTED_DRILLDOWN`, `EMPTY_DIAGRAM`),
independent of the engine, so it keeps holding when the engine starts accepting
cases we refuse today; a throwing engine maps to `ENGINE_FAILED`. Formatting
computes first and applies only on success, so every failure path leaves the
model untouched.

**Cleanup is a separate command**, never part of formatting: it reports its
findings, asks for confirmation, and recomputes the findings before applying,
because a stale id list cannot survive the round trip. Format itself is
guaranteed to touch only DI.

**No configuration and no format-on-save.** The engine has no options to
expose, and a greenfield relayout on every save would discard manual
arrangement silently. Formatting happens on explicit action only.

## Alternatives considered / rejected

### Hand-roll a Sugiyama pipeline

Full control over BPMN specifics (lanes, boundary events, back edges) and
configurable spacing, but several weeks of work to reach a quality bar that
bpmn-io already clears. Kept as an exit option: it would be a second
implementation of the same port, leaving the entire integration intact. The
triggers are recorded in the implementation plan — an upstream refusal of a
spacing options parameter, a real need for incremental layout or
format-selection, or the alpha never stabilising.

### Ship on `latest` (1.3.0) and refuse pools and lanes

A stable release tag, but the MVP would have to refuse collaborations, lanes,
artifacts and labels outright — refusals that exist only to work around a
version we would replace anyway.

### Round-trip the engine's XML through `importXML`

Far less code: no applier at all. Rejected because the re-import empties the
bpmn-js command stack, so Ctrl+Z after a format undoes the action *before* it
rather than the format — plus re-import flicker and lost selection.

### Run the layout host-side in `modeler-core`

The adapter is Node-safe, so the host could layout and write the document
directly. Same undo problem as above, and three host implementations instead of
one.

### elkjs

Mature layered layout with hierarchy and orthogonal routing, but ~1.5 MB of
GWT-compiled bundle, EPL-2.0 in an Apache-2.0 published package, and no BPMN
semantics to tune.

## Consequences

- `@miragon/bpmn-modeler` takes a new runtime dependency on an **alpha**
  release. The port and our own pre-flight are the mitigation; upgrading to
  2.0.0 final should touch only `engine/`.
- Formatting costs a second `bpmn-moddle` parse on the webview's main thread.
  If large diagrams stall, moving the adapter into a Web Worker is the next
  step and needs no change above the port.
- `formatDiagram` / `cleanupDiagram` are deliberately kept **out** of
  `StableModelerSurface` for now: an upstream options parameter would change
  their signature, and that contract is frozen once published.
- Lanes formatted by this feature pass through `UpdateFlowNodeRefsBehavior`,
  which recomputes `bpmn:Lane.flowNodeRef` from geometry. The claim that
  formatting only changes DI therefore rests on the layout preserving lane
  membership, and is asserted by a test rather than by construction.
- Spacing stays fixed until `layoutProcess(xml, options)` exists upstream.
