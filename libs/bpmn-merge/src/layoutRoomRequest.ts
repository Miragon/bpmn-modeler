import type { DiagramBounds } from "./layoutGeometry";
import type { FrameScope } from "./layoutFrames";

/** Room asked for a box in the frame a shape lies in. */
export interface RoomRequest {
    /** What must lie clear of everything that may give way. */
    readonly box: DiagramBounds;
    /** Only what lies at or past it along the axis gives way; a frame by its near side, a node by its center. */
    readonly line: number;
    /**
     * The parts of the shape a stacked group lies under, which give way as
     * one with the box: what overlaps them gives way too, with no clearance,
     * as both sides drew what lies merely near them.
     */
    readonly column?: readonly DiagramBounds[];
    /** How far back the line may move to take in what the box lands on before it. */
    readonly floor?: number;
    /** What never gives way nor stands in the way: the moved group, a frame that grows, or what already gave way. */
    readonly exclude: ReadonlySet<string>;
    /** What never gives way in the box's own frame but stands in the way of a frame growing around it: the shape the group lay on. */
    readonly stays?: ReadonlySet<string>;
    /**
     * Set when the box is the strip a frame gains by growing, to how far it
     * grew: what the strip lands on shifts that far, and only what lies
     * across from it along the axis counts, as the frame lay beside the rest
     * before it grew.
     */
    readonly frameGrowth?: number;
}

/** Room asked in the frames a shape lies in, on its plane. */
export type FrameRequest = RoomRequest & FrameScope & { readonly plane: string };
