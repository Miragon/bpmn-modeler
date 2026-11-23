# Merge layout

- Status: proposed
- Last reviewed: 2026-11-21

## Context

The merge builds one file from two sides' drawings ([merge build](merge-build.md)). Each
element keeps its side's drawing, so the result can hold a spot neither side drew: a flow whose
end one side moved, a task the other side placed on it, a block both sides moved apart. This
record covers how the build finds those spots, which shapes it moves, which containers it grows,
which lanes it stacks, which flows it re-routes and what it tells the reviewer (#2565, #2567, #2596,
#2738).

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
  parent lanes grow to hold it, and what lies below the band on the plane shifts down, while
  another pool across the band keeps its place with what it holds, as it starts above the line.
  The band is opened by the one space tool that also makes room and grows a frame below
  (`layoutSpaceTool.ts`, #2592), so a shape shifts by its center (a sub-process drawn open by
  its near side, with its contents), a boundary event with its host, a pool with its lanes and
  what it holds (its nodes wherever drawn, and the data stores and artifacts lying in it), and
  a flow stretches by its runs across the band, a run between its ends going with the shifted
  end once it lies past the line. The tool checks nothing; each caller decides: making room and
  growing a container drop a result that breaks the drawing, stacking does not. The tool alone
  names the outermost shapes that gave way, in document order, a lane shifted below a grown
  lane among them, so a note names the same shapes whichever step shifted them (#2667). Its members
  stay where they lie unless their host or sub-process shifts, so the container step brings
  them into the band, following the side that drew them in the lane. The step needs no guard
  of its own: it only opens a band, the spots it could make involve the members it leaves for
  the container step, which guards each move, and the notes are read after it, so any spot left
  is named. The note names the lane, the pool and parent lanes it grew and the shapes it
  shifted; a lane overlap left says the build could not repair it. Rejected: moving member
  shapes between overlapping bands, which rewrites what each band holds and moves shapes
  neither side moved (about two more days, decided against on #2565); each lane from its own
  side, which overlapped 28 times on the harvest of 507 results; stacking only a lane the
  detector names in an overlap, which left a lane the other side added below its pool outside
  the pool, unnamed; a band with its own rules (each shape by its top edge, a flow point by
  point), which left a boundary event behind its host and bent a flow at an end that stays.
  Cost: the pool grows taller than either side drew it; a shape hanging over the line shifts
  with the band where its center lies past it; a node of another pool drawn outside it stays
  with that pool;
  a boundary event in another lane than its host lay in both while they overlapped and is now
  noted outside its lane; lanes of a process no pool of the result draws are not stacked; on
  the harvest, a result with no lane overlap stays byte-equal to the build without this step
  (`buildMergedRepairLocality.spec.ts`), and stacking a lane with 200 members stays
  within a fraction of parsing an 800 KB file (`layoutFlowRepairTime.spec.ts`).
- *The placed-by-build test counts two planes as one place when the DI assembly puts them in
  one slot.* The container step and the overlap step below move only a shape the build placed:
  one that not both sides draw where the result does. Each layout shape carries the result's
  slot for its plane (`PlaneSlots`), read with the slots the assembly uses, so a collaboration's
  plane and the planes of the processes either side's pools name are one place, as one
  side may wrap a process in a pool and the other not; the root planes of two unrelated
  processes and a collapsed sub-process's plane are elsewhere (#2589, #2597). So is the plane of
  a process with lanes that no pool names, or that only a participant without an id names,
  though bpmn-js draws it from the collaboration's plane and the build check accepts it there:
  a side may give it a diagram of its own, which one slot would fold onto the collaboration's
  plane (#2702). Rejected:
  comparing plane ids, which moved a whole lane's members both sides draw at one place under two
  root plane ids; counting any two root planes as one, which took a shape that changed process
  between two process diagrams for drawn in place; and matching two planes by a process both
  draw, read per document, which disagreed with the assembly when one side draws two processes
  on two planes and the other wraps both in one collaboration. Cost: reading a document's layout
  needs both sides' slots; a reader of one document alone gets the slots of that document merged
  with itself.
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
- *A shape only one side draws keeps its place beside its flow neighbour, not its coordinates*
  (#2738). Before the spots are found, each shape one side draws and the other does not, still
  where that side drew it, moves with its boundary events and contents by as far as the result
  moved its neighbour. Its neighbours are those that side joined it to (so a flow the result
  dropped still counts) in the shape's plane slot, sub-process and lanes, sequence flows before
  associations, predecessors first, and the first of them places it: one both sides draw, or
  one the side added with it, which it then follows (#2775). So a chain of added shapes stays
  as its side drew it behind its first shape, and a flow between shapes that move alike moves
  with them. Added shapes that lead only to each other follow the first neighbour both sides
  draw. The shape keeps its gap to the border of the neighbour it faces, on the side it lies
  on, and its offset from the neighbour's middle across the flow; it lies along the flow from a
  neighbour it overlaps across, else along the axis their middles lie farther apart on. Message
  flows do not count, as they join pools. Where the neighbour lies as the side drew it, nothing
  moves. Rejected: the side's coordinates, which left a task one side added far from its
  neighbours or on another shape once the other side moved or re-laid out the flow, and the
  overlap repair then moved it further; following a neighbour the result draws in another
  sub-process or lane, which pulled the shape onto that sub-process's border (harvest seed 74)
  or out of its lane, a spot only the build made; the first neighbour both sides draw before
  an added predecessor, which pulled the last shape of a chain to a successor the other side
  had left close by, onto or before the chain's first shapes. Cost: the shape lies where
  neither side drew it and no note names the move, as it lies where its side drew it among its
  neighbours, though the flows it breaks are re-routed and noted; a neighbour moved into
  another sub-process or lane is not followed, nor one a flow across lanes joins; the last
  shape of a chain does not follow a successor the other side moved; a neighbour a later repair
  moves back, off another shape, leaves the added shape where the neighbour lay; a task one
  side added inside a sub-process the other side dragged follows its predecessor, and the
  sub-process's contents stay torn as before.
- *A chain of shapes one side added gets room as one piece, in line* (#2775). The shapes one
  side added that its sequence flows and associations join in one sub-process and lanes,
  without passing a shape both sides draw, are a chain, a boundary event with its host. Before
  any overlap is repaired shape by shape, two chains that lie on each other, one from each
  side, as when both sides inserted steps after the same task, go one after the other: first
  the one a flow of the result leads from into the other, else the one a flow enters from
  outside both, where it lies; the other 50 px behind its far side, in its rows. A chain of
  several steps on a shape both sides draw that it leads into stays, and the shape gives way.
  Either way everything at or past the leading shape of the first chain in its container
  shifts by one amount that clears the chains, as the modeler's space tool opens a band, and
  the frames grow as for any room; a flow the band stretches through a chain is re-routed.
  Every pair of chains is settled before a chain makes the shape it leads into give way, as
  that band would take the other chain along. Left to the shape repair below: two single
  steps, which it stacks as branches; chains a flow enters each, or none; a chain on a shape
  it does not lead into; a shape no sequence flow joins. Rejected: repairing a chain shape by
  shape, which put the shapes of two chains between each other and pushed a gateway behind the
  chain past its own branch targets, as a room moves only what is in the way; stacking the
  chain no flow enters below the other as a branch, which needs room downward for several rows
  and still leaves the join behind both; no band, as for single shapes below, where it moved
  bystanders for one shape: a chain is several steps wide, and the side that added it opened
  that band with the space tool itself. Cost: the band shifts every shape past its line in the
  container, bystanders in other lanes included, and grows the frames by the full shift; in a
  result that keeps one side's flow, the other side's chain lies in line though no flow enters
  it, and the flow past it takes a detour; the note names the chain's leading shape as moved,
  not every shape of it; room is made only to the right.
- *The build moves the shape it placed off a shape from the other side, stacks a parallel
  branch, and makes room only as a last resort.* For each overlap the detector names as
  introduced, it moves a shape that not both sides draw where the result does (one side moved
  it, or only one side has it), so one side's own drawing may move off the other side's shape;
  never a boundary event, which goes with its host. It carries the shape's label, boundary events
  and, drawn open, its contents. The shape goes first to where the other side draws it, a shape
  only one side draws to its side's coordinates (#2738): where a result mixes both sides' frames,
  those often lie among the shape's other neighbours, and on the synthetic merges dropping the
  try put fewer added tasks in place. Where one side re-laid out the diagram
  ([layout side](merge.md#decisions-and-reference-rules)), the result has that side's frame and
  the other side's coordinates lie in another, so only that side's place is tried: every side's
  made shapes jump across the diagram and put one of three added tasks out of place, and none
  sent a shape only the other side moved past its own successor. The
  slot after that comes from the sequence flows between the two shapes, a boundary event's
  counting as its host's, where those flows run right (#2596): a shape that shares a predecessor
  or a successor with the other and is joined to it by no flow is a parallel branch, which a
  modeller stacks, so it goes below the other shape (below the host and its boundary events when
  it lay on a boundary event), centred in its column, 40 px under it and its label, as far along
  the flow as keeps it 15 px clear of foreign flows and their labels, even when a free place lies
  in line (the user's choice on #2596). Otherwise, or when stacking fails, a shape only one side
  draws gets a room, as below, when that grows no frame (#2738): in line it stays beside its
  flow neighbours, which a free place off their row lost, though a room whose flows clash less
  may still go before or below the other shape; a growing frame falls back, as on the
  harvest it widened a pool and its lanes for a catch event a free place nearby held. Then the
  shape goes to the nearest place within 250 px that keeps every moved shape in the pool, lanes and sub-processes it lies
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
  when that lands on nothing. A group holds no element, so it is no frame and no spot names it,
  but it follows the push (#2599): the shapes it enclosed before, but the moved ones, are its
  content; it shifts with them when all shifted by one amount, else it grows along the push by
  as far as their far side went, labels included, and its name moves as bpmn-js moves a group's
  label on resize. It stays as drawn where following would take in a shape it did not enclose,
  as a group around a foreign shape misleads more than one its content left. Rejected: leaving
  groups where they were, so a group enclosed what the push brought under it; a group as an
  obstacle, which blocks rooms fine for every shape, as a group often spans a row. Cost: a shape
  a room places or shifts into a group it never enclosed stays inside it, where the group
  encloses shapes on both sides of it or none of its content moved; a group that stays so as not
  to take in a shape loses the content that moved; only the room push moves groups, so a group
  stays as drawn around shapes the build stacks with their lane, moves into their container or
  off another shape, and around a frame the container step grows; a group's associations are
  left as drawn. A stacked branch and the shape above it then give way as one
  column along the flow: what the stacked shape comes within 15 px of gives way, and so does
  what overlaps the shape above or its label, as in the column the two branches take one place;
  what lies merely near the shape above stays, as only introduced spots are repaired. Every place a
  room tries, the slot after and up to 50 px further along the flow, or each step below, must
  leave the moved shape 15 px clear of foreign labels and of foreign flows beside it once the
  room is made; a flow running through it is a spot the flow repair re-routes. The flows between shifted and staying shapes stretch
  by runs across the push, so their segments keep their direction. Each room re-routes the
  moved shape's flows inside its trial with the build's own flow repair (#2600). Between the two shapes
  of a pair, the room whose re-routed flows clash with fewer other flows wins (a crossing each,
  and a flow run on for more than 10 px unless the two share an end), then the one that shifts
  fewer shapes (a lane shifted below a grown lane not counted, as the growth already weighs it),
  then the one that grows the frames less, then the shape with fewer flows. When
  the room in line still clashes, the slots neither listed in line nor stacked in (before and below;
  before alone for a stacked branch, below alone for a shape that leads into the other) are tried too, and one wins only with fewer clashes,
  so the in-line order holds where every slot clashes alike and where no room in line exists;
  the slot after a shape that leads into the other is only the fallback for no room before
  it, never weighed for its flows, as it would turn the flow back. A room that adds any shape spot (an overlap, a shape outside its
  frame, an event off its host), lays a pool on another or covers the other shape is dropped
  and the overlap noted as not repaired. The flow repair then runs on the moved drawing, so it
  re-routes the moved shapes' flows and names a flow a move broke; a spot a move mended, other
  than the overlap itself, gets no note. The note names the moved shape and, for a room, every
  outermost shape it shifted and every frame it grew (the user's choice on #2565: make room,
  but say what moved); an overlap an earlier move resolved names the shape of the two that
  moved. Rejected: making room first for every shape, which shifts shapes beyond the two that meet when
  a free place lies near (the harvest changed in four merges, each pushing three to four shapes
  aside or growing a pool where one moved); leaving both shapes for the user, which keeps tasks hidden behind others and
  their flows running through them; shifting everything past a vertical line, which moved
  bystanders in other lanes, widened every frame by the full shift and, keeping the moved shape
  in line, always put it on the other branch's flow, so one or two flows were detoured around
  it; a weighted score over candidate places, ranked last by the design's judges and refuted
  where it claimed to stack; bpmn-js's space tool, which grows only the hovered sub-process over
  its siblings; stacking above, which shifts nothing below but moves the pool's origin. Cost:
  merges that reached making room now stack the moved shape below instead of in line and grow
  the lane instead of widening the pool, so the lanes under it shift across their full width;
  pushing before the other shape moves the other shape of the pair and what follows it, which
  the old room never did; a cramped spot both sides drew beside a stacked column stays, while a
  shape both sides drew on the shape above it shifts with what follows it in line; a room taken
  for its flows may shift more shapes or grow more than the room in line (on the harvest, seed
  74 keeps an end event before the gateway and pushes the gateway on, seed 69 stacks a task
  under the sub-process it lay on and grows the sub-process around both by 210 px); only the moved shape's flows are weighed,
  so a foreign flow a room breaks may take a detour, and bends do not count; flows that do not
  run right keep the
  in-line order; a label bpmn-js places itself, without bounds in the file, is not seen; the
  container step keeps only off flows, as the clearance there added a crossing; each try still
  builds a trial drawing and finds the spots of the whole drawing once, and each room once more
  to re-route the moved shape's flows (`layoutFlowRepairTime.spec.ts`); a result with no
  introduced overlap stays byte-equal to the flow repair alone
  (`buildMergedRepairLocality.spec.ts`).
- *A layout both sides changed differently is a note, not a conflict, one per moved block
  and kept side.* Rejected: one note per element, which floods the notes for one moved
  block. Lanes join no block, since one lane can hold most of a diagram. A flow drawn from
  another side than one of its ends is left out, as each side only moved an end; the spot
  notes name it if it no longer meets one. Without a base there is none, as every element the
  sides draw differently would get one.

## Consequences

- Shapes keep their side's coordinates, and so does every flow the merge did not break, unless
  the build placed a shape only one side draws beside its neighbour, stacked a lane, moved a shape into its container or off another, or grew a
  container or made room; a stacked lane, a moved shape, a grown container, a shifted shape and
  a re-routed flow differ from both sides and a note names them; a group that followed a push
  differs too, and no note names it. A boundary event off its host
  is still named, not moved, and so are lanes that overlap in a process without a pool.
