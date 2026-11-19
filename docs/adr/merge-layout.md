# Merge layout

- Status: proposed
- Last reviewed: 2026-11-19

## Context

The merge builds one file from two sides' drawings ([merge](merge.md#building-the-file)). Each
element keeps its side's drawing, so the result can hold a spot neither side drew: a flow whose
end one side moved, a task the other side placed on it, a block both sides moved apart. This
record covers how the build finds those spots, which shapes it moves, which containers it grows,
which lanes it stacks, which flows it re-routes and what it tells the reviewer (#2565, #2567, #2596).

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
  others, within a budget per harvested case (`buildMergedRepairLocality.spec.ts`, on 37
  copied fuzz inputs, which also keeps a result with no broken flow byte-equal); every build
  plans the repair (`layoutFlowRepairTime.spec.ts`).
- *The build stacks a lane drawn apart from its pool's lanes below them.* The layout-side rule
  draws a pool and its lanes from one side ([merge](merge.md#decisions-and-reference-rules)), so
  only a lane that side does not draw in place, such as one only the other side has, comes from
  the other side and may lie on the block or outside its pool. Each such lane that lies on a
  sibling or outside its parent lane or pool moves first, in the result's order, at its own
  height below its siblings, as wide as they are, its child lanes with it; the pool and its
  parent lanes grow to hold it, and what lies below the band on the plane shifts down, the
  flows to it stretching, as the modeler's space tool does, while another pool across the band
  keeps its place and contents. Its members stay where they lie, so the container step brings
  them into the band, following the side that drew them in the lane. The step needs no guard
  of its own: it only opens a band, the spots it could make involve the members it leaves for
  the container step, which guards each move, and the notes are read after it, so any spot left
  is named. The note names the lane, the pool and parent lanes it grew and the shapes it
  shifted; a lane overlap left says the build could not repair it. Rejected: moving member
  shapes between overlapping bands, which rewrites what each band holds and moves shapes
  neither side moved (about two more days, decided against on #2565); each lane from its own
  side, which overlapped 28 times on the harvest of 507 results; stacking only a lane the
  detector names in an overlap, which left a lane the other side added below its pool outside
  the pool, unnamed. Cost: the pool grows taller than either side drew it; the band has its
  own shift and stretch rules beside the push that makes room and grows a sub-process until one
  space tool serves both (#2592);
  a boundary event in another lane than its host lay in both while they overlapped and is now
  noted outside its lane; lanes of a process no pool of the result draws are not stacked; on
  the harvest, a result with no lane overlap stays byte-equal to the build without this step
  (`buildMergedRepairLocality.spec.ts`), and stacking a lane with 200 members stays
  within a fraction of parsing an 800 KB file (`layoutFlowRepairTime.spec.ts`).
- *Two root planes are one place in the placed-by-build test.* The container step and the
  overlap step below move only a shape the build placed: one that not both sides draw where the
  result does. There a collaboration's plane and a process's count as one place, as one side
  may wrap the process in a pool and the other not, while a collapsed sub-process's plane counts
  as elsewhere (#2589). Rejected: comparing plane ids, which moved a whole lane's members both
  sides draw at one place under two root plane ids. Cost: any two root planes count as one,
  though the result joins a collaboration only with the processes its participants name, so a
  shape that changed process between two process diagrams counts as drawn in place (#2597).
- *The build brings a shape it placed outside its container back inside, and grows the
  container only as a last resort.* Once the lanes are stacked and before any other move, each
  shape the detector names as
  introduced outside its sub-process, pool or lane goes inside when the build placed it there: by the
  placed-by-build test, or as it lies in a frame
  no side draws where it lies, such as a lane the build stacked; with its label, boundary
  events and contents; never a boundary event on its own. A shape both sides draw where it lies in
  a frame a side draws there stays, noted as not repaired: its spot comes from one side's lane bounds and the other's lane
  refs, which drawing a pool's lanes from one side removes where a side changed only the lanes. It goes first as a side that draws it
  where it lies moved the container, or else a sibling in that container, nearest first, both
  read at their size on any plane, as a side that draws a sub-process collapsed draws its
  contents on the sub-process's own plane; then to the nearest free place inside, searched from
  the nearest place inside within 250 px. Every move keeps it off the container's border and
  name band (a sub-process's top 30 px), 15 px clear of other shapes and off every flow that is
  not its own, kept only
  inside the frames it must lie in (a sub-process stands for its contents in the lanes). Only
  when neither exists does the build grow the sub-process to every side, its boundary events
  going with the border they sit on, or the pool with its lanes sideways, to hold the shape
  where it lies; a sub-process grown right onto what lies beyond it pushes what its new strip
  lands on, as making room does. A growth that adds any shape spot, or lays a pool on
  another, is dropped and the shape noted as not repaired. A lane never grows to hold a shape,
  as lanes are stacked, so a shape goes into its lane's band only where the band holds it. The note
  says the build moved the shape into its containers, grew them, or grew them and shifted what it
  lists; an overlap such a move resolved names the moved shape. Rejected: growing first, which
  widens a pool or sub-process where a free place lies inside; leaving every shape where it lies,
  which leaves a task the build placed in another lane or outside its sub-process; moving a shape
  both sides draw where it lies, which crams a whole lane's members into the band one side drew.
  Cost: such a shape stays outside, noted, where the lanes' side still draws its lane apart
  from where both sides draw the shape; growth shifts only right; each growth finds the spots
  of the whole drawing once (`layoutFlowRepairTime.spec.ts`). `buildMergedRepairLocality.spec.ts` keeps a
  result with no shape outside its container byte-equal to the build without this step, and
  checks that the step changes only what a note names, with what goes with it.
- *The build moves the shape it placed off a shape from the other side, stacks a parallel
  branch, and makes room only as a last resort.* For each overlap the detector names as
  introduced, it moves a shape that not both sides draw where the result does (one side moved
  it, or only one side has it), so one side's own drawing may move off the other side's shape;
  never a boundary event, which goes with its host. It carries the shape's label, boundary events
  and, drawn open, its contents. The shape goes first to where the other side draws it. The
  slot after that comes from the sequence flows between the two shapes, a boundary event's
  counting as its host's, where those flows run right (#2596): a shape that shares a predecessor
  or a successor with the other and is joined to it by no flow is a parallel branch, which a
  modeller stacks, so it goes below the other shape (below the host and its boundary events when
  it lay on a boundary event), centred in its column, 40 px under it and its label, as far along
  the flow as keeps it 15 px clear of foreign flows and their labels, even when a free place lies
  in line (the user's choice on #2596). Otherwise, or when stacking fails, it goes to the nearest
  place within 250 px that keeps every moved shape in the pool, lanes and sub-processes it lies
  in, no further out of a sub-process it hangs out of, 15 px clear of other shapes, of flows that
  are not its own and of their labels. Only when none exists does it make room in line: before the other shape
  when it leads into it, which keeps it in place and pushes the other on, never leftward, else
  after it. A room pushes only what is in the way, as the modeler's space tool would held over
  just that: what the shape lands on gives way along the flow (or down, below), with what that
  lands on and the shapes in line after it that its flows lead to while their gap would fall
  below 50 px. A frame grows only when it no longer holds what lies in it, and then keeps the
  margin it had to its far-most content, at least 10 px and at most the room's gap (50 px along
  x, 40 px down), as the space tool carries the border along. Its new strip is room asked of the
  frame around it, up to the pools on the plane, so a growing sub-process pushes its siblings
  and a growing pool the pool beside it instead of covering them; the strip moves only what lies
  across from it, as the frame already lay beside the rest. Room below grows the lane; the lanes
  under it shift down across the pool, and another pool that ended level with it grows as far
  when that lands on nothing. A stacked branch then stays clear of what lies right of it; what
  lies right of the shape above it stays, as only introduced spots are repaired. Every place a
  room tries, the slot after and up to 50 px further along the flow, or each step below, must
  leave the moved shape 15 px clear of foreign labels and of foreign flows beside it once the
  room is made; a flow running through it is a spot the flow repair re-routes. The flows between shifted and staying shapes stretch
  by runs across the push, so their segments keep their direction. Between the two shapes of a
  pair, the room that shifts fewer shapes wins, then the one that grows the frames less, then
  the shape with fewer flows. A room that adds any shape spot (an overlap, a shape outside its
  frame, an event off its host), lays a pool on another or covers the other shape is dropped
  and the overlap noted as not repaired. The flow repair then runs on the moved drawing, so it
  re-routes the moved shapes' flows and names a flow a move broke; a spot a move mended, other
  than the overlap itself, gets no note. The note names the moved shape and, for a room, every
  outermost shape it shifted and every frame it grew (the user's choice on #2565: make room,
  but say what moved); an overlap an earlier move resolved names the shape of the two that
  moved. Rejected: making room first, which shifts shapes beyond the two that meet when a free
  place lies near; leaving both shapes for the user, which keeps tasks hidden behind others and
  their flows running through them; shifting everything past a vertical line, which moved
  bystanders in other lanes, widened every frame by the full shift and, keeping the moved shape
  in line, always put it on the other branch's flow, so one or two flows were detoured around
  it; a weighted score over candidate places, ranked last by the design's judges and refuted
  where it claimed to stack; bpmn-js's space tool, which grows only the hovered sub-process over
  its siblings; stacking above, which shifts nothing below but moves the pool's origin. Cost:
  merges that reached making room now stack the moved shape below instead of in line and grow
  the lane instead of widening the pool, so the lanes under it shift across their full width;
  pushing before the other shape moves the other shape of the pair and what follows it, which
  the old room never did; a cramped spot both sides drew beside a stacked column stays; on the
  harvest, a fuzz result (seed 74) now moves a gateway instead of an end event, whose re-routed
  flow runs on another, and one (seed 69) keeps a sub-process in its parent at the cost of a
  crossing; flows that do not run right keep the
  in-line order; a label bpmn-js places itself, without bounds in the file, is not seen; the
  container step keeps only off flows, as the clearance there added a crossing; each try still
  builds a trial drawing and finds the spots of the whole drawing once
  (`layoutFlowRepairTime.spec.ts`); a result with no introduced overlap stays byte-equal to the
  flow repair alone (`buildMergedRepairLocality.spec.ts`).
- *A layout both sides changed differently is a note, not a conflict, one per moved block
  and kept side.* Rejected: one note per element, which floods the notes for one moved
  block. Lanes join no block, since one lane can hold most of a diagram. A flow drawn from
  another side than one of its ends is left out, as each side only moved an end; the spot
  notes name it if it no longer meets one. Without a base there is none, as every element the
  sides draw differently would get one.

## Consequences

- Shapes keep their side's coordinates, and so does every flow the merge did not break, unless
  the build stacked a lane, moved a shape into its container or off another, or grew a
  container or made room; a stacked lane, a moved shape, a grown container, a shifted shape and
  a re-routed flow differ from both sides and a note names them. A boundary event off its host
  is still named, not moved, and so are lanes that overlap in a process without a pool.
