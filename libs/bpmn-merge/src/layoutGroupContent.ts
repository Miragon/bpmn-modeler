import { type Axis, boundsShifted, farSideOf, grownAlong, nearSideOf } from "./layoutAxis";
import type { DrawingDraft } from "./layoutDrawingDraft";
import { type DiagramBounds, liesWithin, sameBounds } from "./layoutGeometry";
import type { GroupShape, LayoutModel } from "./layoutModel";

/** Where a shape a group encloses lay when a push started and where the push left it. */
export interface EnclosedMove {
    readonly from: DiagramBounds;
    readonly to: DiagramBounds;
}

/**
 * The group after a push along the axis moved what it encloses: shifted with
 * it when all of it shifted by one amount, else grown at its far side as far
 * as the far side of what it encloses went, so it keeps its margin to it.
 */
export function groupAfterPush(
    group: GroupShape,
    enclosed: readonly EnclosedMove[],
    axis: Axis,
): GroupShape {
    const shifts = enclosed.map((move) => shiftOf(move, axis));
    const [first] = shifts;
    if (first !== undefined && first !== 0 && shifts.every((shift) => shift === first)) {
        return { ...group, bounds: boundsShifted(axis, group.bounds, first) };
    }
    const farOf = (all: readonly DiagramBounds[]) =>
        Math.max(...all.map((bounds) => farSideOf(axis, bounds)));
    const growth = farOf(enclosed.map(({ to }) => to)) - farOf(enclosed.map(({ from }) => from));
    return growth > 0 ? { ...group, bounds: grownAlong(axis, group.bounds, growth) } : group;
}

/** How far the move shifted the bounds along the axis, undefined when it did more than shift them. */
function shiftOf({ from, to }: EnclosedMove, axis: Axis): number | undefined {
    const by = nearSideOf(axis, to) - nearSideOf(axis, from);
    return sameBounds(boundsShifted(axis, from, by), to) ? by : undefined;
}

interface Enclosure {
    readonly group: GroupShape;
    readonly enclosed: readonly string[];
    readonly from: readonly DiagramBounds[];
}

/**
 * The groups on a plane with the shapes each encloses as a drawing drew
 * them, read when a push starts, so that each group can follow what the
 * push did to them.
 */
export class GroupContent {
    private constructor(private readonly enclosures: readonly Enclosure[]) {}

    /**
     * The plane's groups, each with the shapes other than groups and those in
     * `placed` that it encloses in `before`, where `trial` draws them now.
     */
    static of(
        before: LayoutModel,
        trial: LayoutModel,
        plane: string,
        placed: ReadonlySet<string>,
    ): GroupContent {
        const onPlane = [...before.shapes.values()].filter((shape) => shape.plane === plane);
        const groups = onPlane.filter((shape): shape is GroupShape => shape.kind === "group");
        const enclosures = groups.flatMap((group): Enclosure[] => {
            const enclosed = onPlane
                .filter(
                    (shape) =>
                        shape.kind !== "group" &&
                        !placed.has(shape.id) &&
                        liesWithin(shape.bounds, group.bounds),
                )
                .map(({ id }) => id);
            if (enclosed.length === 0) return [];
            const now = trial.shapes.get(group.id) as GroupShape;
            const from = enclosed.map((id) => trial.shapes.get(id)!.bounds);
            return [{ group: now, enclosed, from }];
        });
        return new GroupContent(enclosures);
    }

    /** Draws each group in the trial as it follows what the push along the axis did to the shapes it encloses. */
    follow(trial: DrawingDraft, axis: Axis): void {
        for (const { group, enclosed, from } of this.enclosures) {
            const moves = enclosed.map((id, at) => ({
                from: from[at]!,
                to: trial.shapes.get(id)!.bounds,
            }));
            const after = groupAfterPush(group, moves, axis);
            if (after !== group) trial.replaceShape(after);
        }
    }
}
