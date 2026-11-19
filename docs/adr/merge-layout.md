# Merge layout

- Status: proposed
- Last reviewed: 2026-11-19

## Context

The merge builds one file from two sides' drawings ([merge](merge.md#building-the-file)). Each
element keeps its side's drawing, so the result can hold a spot neither side drew: a flow whose
end one side moved, a task the other side placed on it, a block both sides moved apart. This
record covers how the build finds those spots, which shapes it moves, which flows it re-routes
and what it tells the reviewer (#2565).

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
- *The build moves the shape it placed off a shape from the other side, and makes room only
  as a last resort.* For each overlap the detector names as introduced, it moves a shape that
  not both sides draw where the result does (one side moved it, or only one side has it), so
  one side's own drawing may move off the other side's shape; never a boundary event, which
  goes with its host. It carries the shape's label, boundary events and, drawn open, its
  contents. The shape goes first to where the other side draws it, else to the nearest place
  within 250 px that keeps every moved shape in the pool, lanes and sub-processes it lies in,
  15 px clear of other shapes and off every flow that is not its own. Only when neither
  exists does it make room as the modeler's space tool does: the shapes of its pool (or
  plane) past a line right of the other shape shift right, the frames across the line widen,
  and the flows between them stretch by vertical runs so their segments keep their direction.
  A room that adds any shape spot (an overlap, a shape outside its frame, an event off its
  host) is dropped and the overlap noted as not repaired. The flow repair then runs on the
  moved drawing, so it re-routes the moved shapes' flows and names a flow a move broke; a
  spot a move mended, other than the overlap itself, gets no note. The note names the moved
  shape and, for a room, every outermost shape it shifted (the user's choice on #2565: make
  room, but say what moved); an overlap an earlier move resolved names the shape of the two
  that moved. Rejected: making room first, which shifts shapes beyond the two that meet when
  a free place lies near; leaving both shapes for the user, which keeps tasks hidden behind
  others and their flows running through them. Cost: room goes only right; a placement checks
  only shapes and flows near it, through the detector's grid, but each room finds the spots
  of the whole drawing once (`layoutFlowRepairTime.spec.ts`); a result with no introduced
  overlap stays byte-equal to the flow repair alone (`buildMergedRepairLocality.spec.ts`).
- *A layout both sides changed differently is a note, not a conflict, one per moved block
  and kept side.* Rejected: one note per element, which floods the notes for one moved
  block. Lanes join no block, since one lane can hold most of a diagram. A flow drawn from
  another side than one of its ends is left out, as each side only moved an end; the spot
  notes name it if it no longer meets one. Without a base there is none, as every element the
  sides draw differently would get one.

## Consequences

- Shapes keep their side's coordinates, and so does every flow the merge did not break, unless
  the build moved a shape off another or made room for it; a moved shape, a shifted one and a
  re-routed flow differ from both sides and a note names them. A shape outside its container
  or off its host is still named, not moved.
