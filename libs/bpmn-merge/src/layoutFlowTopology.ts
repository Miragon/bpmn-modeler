import { centerOf } from "./layoutGeometry";
import {
    type LayoutModel,
    carriesSequence,
    flowOwnerOf,
    neighboursJoinedBy,
    nodeShapeIn,
} from "./layoutModel";

/**
 * How a moved shape stands to the shape it lay on by the sequence flows: it
 * follows the other or precedes it, both are branches out of one shape or
 * into one, or no flow joins them.
 */
export type FlowRelation = "follows" | "precedes" | "parallel" | "unrelated";

const NONE: ReadonlySet<string> = new Set();

/** The sequence flows between the nodes of a drawing; a boundary event's flows count as its host's. */
export class FlowTopology {
    private readonly successors = new Map<string, Set<string>>();
    private readonly predecessors = new Map<string, Set<string>>();

    constructor(private readonly layout: LayoutModel) {
        for (const edge of layout.edges.values()) {
            const joined = carriesSequence(edge) ? neighboursJoinedBy(layout, edge) : undefined;
            if (joined === undefined) continue;
            addUnder(this.successors, joined.source, joined.target);
            addUnder(this.predecessors, joined.target, joined.source);
        }
    }

    /**
     * How `moved` stands to `other`: a flow from one into the other comes
     * first, then a shared predecessor or successor. A boundary event stands
     * for its host.
     */
    relationOf(movedShape: string, otherShape: string): FlowRelation {
        const [moved, other] = [this.ownerOf(movedShape), this.ownerOf(otherShape)];
        if (this.followersOf(other).has(moved)) return "follows";
        if (this.followersOf(moved).has(other)) return "precedes";
        const shares = (of: (id: string) => ReadonlySet<string>) =>
            [...of(moved)].some((id) => of(other).has(id));
        const sharesEnd =
            shares((id) => this.predecessorsOf(id)) || shares((id) => this.followersOf(id));
        return sharesEnd ? "parallel" : "unrelated";
    }

    /**
     * Whether the flows at the nodes run to the right, read from the centers
     * of their ends as the layout draws them: further right than up or down,
     * summed over all of them. Nodes no flow touches count as drawn left to
     * right.
     */
    flowsRightAt(layout: LayoutModel, nodes: readonly string[]): boolean {
        let alongX = 0;
        let alongY = 0;
        const counted = new Set<string>();
        for (const id of nodes.map((node) => this.ownerOf(node))) {
            const pairs = [
                ...[...this.followersOf(id)].map((next) => [id, next] as const),
                ...[...this.predecessorsOf(id)].map((previous) => [previous, id] as const),
            ];
            for (const [from, to] of pairs) {
                const key = `${from} ${to}`;
                const source = nodeShapeIn(layout, from);
                const target = nodeShapeIn(layout, to);
                if (counted.has(key) || source === undefined || target === undefined) continue;
                counted.add(key);
                alongX += centerOf(target.bounds).x - centerOf(source.bounds).x;
                alongY += centerOf(target.bounds).y - centerOf(source.bounds).y;
            }
        }
        return counted.size === 0 || (alongX > 0 && alongX >= Math.abs(alongY));
    }

    /** The nodes a sequence flow leads to from the node, or from a boundary event on it. */
    followersOf(id: string): ReadonlySet<string> {
        return this.successors.get(id) ?? NONE;
    }

    /** The nodes a sequence flow leads from into the node; a boundary event's flow counts as its host's. */
    predecessorsOf(id: string): ReadonlySet<string> {
        return this.predecessors.get(id) ?? NONE;
    }

    private ownerOf(id: string): string {
        return flowOwnerOf(this.layout, id);
    }
}

function addUnder(sets: Map<string, Set<string>>, key: string, id: string): void {
    const set = sets.get(key);
    if (set === undefined) sets.set(key, new Set([id]));
    else set.add(id);
}
