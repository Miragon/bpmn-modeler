import type { UndrawnEdge } from "./connectionEnds";
import type { DiagramIndex } from "./diagramIndex";
import type { MergeResolution } from "./mergeDecisions";
import { MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";

/**
 * Which side's DI the result takes for an id: an element's or a drawn part's
 * drawing side, current's for an id no decision and no part covers, and none
 * for a decided element or a part without a drawing side.
 */
export class DrawingSides {
    constructor(
        /** Each drawn element and drawn part of the result with the side whose drawing it takes. */
        readonly sides: Readonly<Record<string, MergeSide>>,
        /** Every part either side holds: one without a side here is not drawn at all. */
        private readonly parts: ReadonlySet<string>,
        private readonly decidedIds: ReadonlySet<string>,
    ) {}

    takenSideOf(id: string): MergeSide | undefined {
        return this.sides[id] ?? (this.staysWhereCurrentDraws(id) ? "current" : undefined);
    }

    /** Current's drawing of an id no decision and no part covers stays on the plane current draws it on. */
    staysWhereCurrentDraws(id: string): boolean {
        return this.sides[id] === undefined && !this.decidedIds.has(id) && !this.parts.has(id);
    }

    isPart(id: string): boolean {
        return this.parts.has(id);
    }
}

/**
 * The layout sides, and for each drawn part of the result (a process's data
 * input, say) the layout side of the element holding it, else the side that
 * element is taken from, whichever draws the part first.
 */
export function drawingSidesOf(
    result: MergeResult,
    resolution: MergeResolution,
    indexes: Readonly<Record<MergeSide, DiagramIndex>>,
): DrawingSides {
    const sides: Record<string, MergeSide> = { ...resolution.layout };
    const parts = new Set<string>();
    for (const element of result.elements) {
        for (const side of MERGE_SIDES) {
            for (const part of element.versions[side]?.parts ?? []) parts.add(part);
        }
        const side = resolution.elements[element.id];
        const version = side === undefined ? undefined : element.versions[side];
        const candidates = [resolution.layout[element.id], side];
        for (const part of version?.parts ?? []) {
            const drawingSide = candidates.find(
                (candidate) =>
                    candidate !== undefined && indexes[candidate].drawingsByElement.has(part),
            );
            if (drawingSide !== undefined) sides[part] = drawingSide;
        }
    }
    return new DrawingSides(sides, parts, new Set(Object.keys(resolution.elements)));
}

/** Elements and parts whose drawing side draws them with a shape or an edge, not only with a plane, less the flows left out. */
export function drawnByShape(
    indexes: Readonly<Record<MergeSide, DiagramIndex>>,
    drawingSides: Readonly<Record<string, MergeSide>>,
    undrawnEdges: readonly UndrawnEdge[],
): Set<string> {
    const leftOut = new Set(undrawnEdges.map(({ id }) => id));
    return new Set(
        Object.entries(drawingSides)
            .filter(([id, side]) => (indexes[side].drawingsByElement.get(id)?.length ?? 0) > 0)
            .map(([id]) => id)
            .filter((id) => !leftOut.has(id)),
    );
}
