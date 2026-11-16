/** A box on the screen, in pixels. */
export interface ScreenBox {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

/** One place a popup at an element could go, and what the caller needs to put it there. */
export interface PlacementCandidate<Placement> {
    readonly box: ScreenBox;
    readonly placement: Placement;
}

/** What a popup at an element should not cover, from most to least important. */
export interface PlacementSurroundings {
    /** The element itself, its pad and anything else the user must still see. */
    readonly keepClear: readonly ScreenBox[];
    /** The pane: a popup partly outside it is cut off. */
    readonly bounds?: ScreenBox;
    /** The element's neighbourhood: its flows, their other ends, what blocks a decision. */
    readonly neighbours: readonly ScreenBox[];
    /** The rest of the diagram the popup should leave readable, where it can. */
    readonly others?: readonly ScreenBox[];
}

// Rounding of a few pixels, the stroke of a shape or the shadow of a pad, is no overlap.
const TOLERANCE_PX = 3;

/**
 * Picks where a popup at an element goes: the candidate covering the least
 * of what must stay clear, then the least outside the pane, then the least
 * of the element's neighbourhood, then the least of the rest of the diagram;
 * the first candidate wins a tie, so the caller lists them in the order it
 * prefers.
 */
export function leastCoveringPlacement<Placement>(
    candidates: readonly PlacementCandidate<Placement>[],
    surroundings: PlacementSurroundings,
): Placement | undefined {
    let best: { placement: Placement; cost: readonly number[] } | undefined;
    for (const { box, placement } of candidates) {
        const cost = [
            coveredArea(box, surroundings.keepClear),
            surroundings.bounds === undefined ? 0 : areaOutside(box, surroundings.bounds),
            coveredArea(box, surroundings.neighbours),
            coveredArea(box, surroundings.others ?? []),
        ];
        if (best === undefined || isCheaper(cost, best.cost)) best = { placement, cost };
    }
    return best?.placement;
}

function isCheaper(cost: readonly number[], than: readonly number[]): boolean {
    for (let index = 0; index < cost.length; index += 1) {
        if (cost[index] !== than[index]) return cost[index] < than[index];
    }
    return false;
}

function coveredArea(box: ScreenBox, others: readonly ScreenBox[]): number {
    return others.reduce((sum, other) => sum + overlapArea(box, other), 0);
}

function overlapArea(first: ScreenBox, second: ScreenBox): number {
    const width =
        Math.min(first.left + first.width, second.left + second.width) -
        Math.max(first.left, second.left);
    const height =
        Math.min(first.top + first.height, second.top + second.height) -
        Math.max(first.top, second.top);
    return width > TOLERANCE_PX && height > TOLERANCE_PX ? width * height : 0;
}

function areaOutside(box: ScreenBox, bounds: ScreenBox): number {
    return box.width * box.height - overlapArea(box, bounds);
}
