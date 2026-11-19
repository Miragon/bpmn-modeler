# Merge layout

- Status: proposed
- Last reviewed: 2026-11-19

## Context

The merge builds one file from two sides' drawings ([merge](merge.md#building-the-file)). Each
element keeps its side's drawing, so the result can hold a spot neither side drew: a flow whose
end one side moved, a task the other side placed on it, a block both sides moved apart. This
record covers how the build finds those spots, which flows it re-routes and what it tells the
reviewer (#2565).

## Decision

- *Broken spots are found by geometry, not by sides.* A pure detector reads the written
  drawing, with 3 px of tolerance for the modeler's rounding. A spot counts only when neither
  side's own drawing has it with that side's own relations (`introducedLayoutSpots`): what a
  side drew stays its business, its shape in a lane the other side gave it does not. A flow's
  end misses its shape outside or inside its outline, and the two count apart, so a shape
  moved onto its flow is named and a side that draws flows into shape centers still has an
  end moved away named. Rejected: notes from the sides an element and its ends or container
  are drawn from, which named flows that still met their shapes and missed hidden tasks and
  flows through shapes; bpmn-js in the webview, which ties the build to an open pane. Cost:
  every build reads three drawings; a grid keeps it linear (`layoutSpotDetectionTime.spec.ts`).
- *The build re-routes the flows it broke, with its own code.* After the diagrams are
  assembled and before the result is written and checked, each flow the detector names as
  introduced (an end off its shape, outside or deep inside, or a run through a shape) is docked
  on its shapes' outlines again (circle, diamond, rectangle), keeping its own bends where they
  still fit, else routed orthogonally around the shapes in a window around its ends, found
  through the detector's grid. Its label keeps its offset from the route. A route must meet
  both shapes, run through none, nor back through one of its own ends, and bend only inside
  the sub-process or pool both ends lie in (grown to hold an end the merge moved out), else the
  flow stays as drawn; the notes read the drawing before the repair and say which flows the
  build moved and which it could not repair. The shapes of a pool a flow ends on are no
  obstacles, as the pool walls them off, and a kept route no route could beat by the allowance
  skips the router, so a flow into a large pool costs no more than one into a task.
  Rejected: a slim bpmn-cli entry (+70 KB gzip on the hosts, built on internals restructured
  twice in three weeks, Node 24 upstream, a tidy that is not local), bpmn-js modeling in the
  webview (the build would wait on an open pane, with a protocol pair in four hosts, and its
  save rewrote lanes), diagram-js's `ManhattanLayout` (no obstacles, and the library's first
  outside dependency). Cost: geometry and a router to maintain here; re-routed flows may cross
  others, within a budget per harvested case (`buildMergedRepairLocality.spec.ts`, on 24
  copied fuzz inputs, which also keeps a result with no broken flow byte-equal); every build
  plans the repair (`layoutFlowRepairTime.spec.ts`).
- *A layout both sides changed differently is a note, not a conflict, one per moved block
  and kept side.* Rejected: one note per element, which floods the notes for one moved
  block. Lanes join no block, since one lane can hold most of a diagram. A flow drawn from
  another side than one of its ends is left out, as each side only moved an end; the spot
  notes name it if it no longer meets one. Without a base there is none, as every element the
  sides draw differently would get one.

## Consequences

- Shapes keep their side's coordinates, and so does every flow the merge did not break; a flow
  the build re-routed differs from both sides and carries a note. A shape on another, outside
  its container or off its host is still named, not moved.
