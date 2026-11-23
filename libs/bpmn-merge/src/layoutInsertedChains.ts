import {
    type LayoutModel,
    type NodeShape,
    carriesSequence,
    flowOwnerOf,
    inSameContainer,
    neighboursJoinedBy,
    nodeShapeIn,
} from "./layoutModel";
import type { ShapeGroup, ShapeGroups } from "./layoutShapeGroups";
import { drawnByOneSideOnly } from "./sideDrawings";

/**
 * The shapes one side added that its flows join: the side drew them as one
 * piece, so they move and get room as one. A boundary event belongs to the
 * chain of its host and its flows count as the host's.
 */
export class InsertedChain {
    private constructor(
        /** The chain's shapes without their boundary events, in the drawing's document order. */
        readonly nodes: readonly NodeShape[],
        /** Those of them a sequence flow of the side joins to another shape. */
        private readonly steps: ReadonlySet<string>,
    ) {}

    /**
     * The chain of the node as the drawing draws it: the shapes only the
     * node's side draws, in the node's sub-process and lanes, that the side's
     * sequence flows and associations join to it without passing a shape both
     * sides draw. Undefined for a node both sides draw.
     */
    static of(
        layout: LayoutModel,
        sides: readonly LayoutModel[],
        node: NodeShape,
    ): InsertedChain | undefined {
        if (!drawnByOneSideOnly(node.id, sides)) return undefined;
        const side = sides.find((drawing) => drawing.shapes.has(node.id))!;
        const start = nodeShapeIn(layout, flowOwnerOf(side, node.id));
        if (start === undefined) return undefined;
        const joined = joinedBy(side);
        const belongs = (id: string) => {
            const shape = nodeShapeIn(layout, id);
            return (
                shape !== undefined &&
                side.shapes.has(id) &&
                drawnByOneSideOnly(id, sides) &&
                inSameContainer(shape, start)
            );
        };
        const members = new Set([start.id]);
        const queue = [start.id];
        while (queue.length > 0) {
            for (const next of joined.neighbours.get(queue.pop()!) ?? []) {
                if (members.has(next) || !belongs(next)) continue;
                members.add(next);
                queue.push(next);
            }
        }
        const nodes = [...layout.shapes.values()].filter(
            (shape): shape is NodeShape => shape.kind === "node" && members.has(shape.id),
        );
        return new InsertedChain(nodes, joined.inSequence);
    }

    /** Whether the chain is more than one step along the flow: a single step is placed and given room as a shape. */
    get hasSeveralSteps(): boolean {
        return this.stepCount > 1;
    }

    /** Whether a sequence flow of the side joins the chain to another shape, so it has a place along the flow. */
    get liesInTheFlow(): boolean {
        return this.stepCount > 0;
    }

    private get stepCount(): number {
        return this.nodes.filter(({ id }) => this.steps.has(id)).length;
    }

    /**
     * The chain as one group where the drawing draws it now: every shape with
     * its boundary events and contents, led by its leftmost step, the flows
     * between its shapes inside and the others attached.
     */
    groupIn(groups: ShapeGroups, layout: LayoutModel): ShapeGroup {
        const drawn = this.nodes.flatMap(({ id }) => nodeShapeIn(layout, id) ?? []);
        const parts = drawn.map((node) => groups.of(layout, node));
        const members = parts.flatMap((part) => part.members);
        const held = new Set(members);
        const edges = [
            ...new Set(parts.flatMap((part) => [...part.innerEdges, ...part.attachedEdges])),
        ];
        const inside = (id: string) => {
            const { source, target } = layout.edges.get(id)!;
            return (
                source !== undefined && target !== undefined && held.has(source) && held.has(target)
            );
        };
        const steps = drawn.filter(({ id }) => this.steps.has(id));
        const node = (steps.length > 0 ? steps : drawn).reduce((lead, next) =>
            next.bounds.x < lead.bounds.x ? next : lead,
        );
        return {
            node,
            members,
            innerEdges: edges.filter(inside),
            attachedEdges: edges.filter((id) => !inside(id)),
        };
    }

    /** Whether a sequence flow of the drawing leads from the chain into the node. */
    leadsInto(layout: LayoutModel, node: NodeShape): boolean {
        const target = flowOwnerOf(layout, node.id);
        return sequenceEndsOf(layout).some(
            ({ source, target: end }) => this.holds(source) && end === target,
        );
    }

    /** Whether the shape is one of the chain's; a boundary event counts as its host. */
    holds(shape: string): boolean {
        return this.nodes.some(({ id }) => id === shape);
    }

    /** Whether a sequence flow of the drawing leads from this chain into the other. */
    private leadsIntoChain(layout: LayoutModel, other: InsertedChain): boolean {
        return sequenceEndsOf(layout).some(
            ({ source, target }) => this.holds(source) && other.holds(target),
        );
    }

    /** Whether a sequence flow of the drawing enters the chain from a shape of neither chain. */
    private enteredFromOutside(layout: LayoutModel, other: InsertedChain): boolean {
        return sequenceEndsOf(layout).some(
            ({ source, target }) =>
                this.holds(target) && !this.holds(source) && !other.holds(source),
        );
    }

    /**
     * The two chains in the order to put them in line as chains, each as
     * its side drew it: both lie in the flow, at least one has several steps
     * (two single steps are stacked or put in line as shapes) and the flows
     * order them (`inFlowOrder`). Undefined otherwise.
     */
    static toPutInLine(
        layout: LayoutModel,
        first: InsertedChain,
        second: InsertedChain,
    ): readonly [InsertedChain, InsertedChain] | undefined {
        if (!first.liesInTheFlow || !second.liesInTheFlow) return undefined;
        if (!first.hasSeveralSteps && !second.hasSeveralSteps) return undefined;
        return InsertedChain.inFlowOrder(layout, first, second);
    }

    /**
     * The two chains in the order the flows of the drawing put them: first
     * the one a flow leads from into the other while none leads back, else
     * the one a flow enters from outside both while none enters the other.
     * Undefined when the flows order them neither way: each is entered, as
     * two branches are, or none.
     */
    static inFlowOrder(
        layout: LayoutModel,
        first: InsertedChain,
        second: InsertedChain,
    ): readonly [InsertedChain, InsertedChain] | undefined {
        const leads = [first.leadsIntoChain(layout, second), second.leadsIntoChain(layout, first)];
        if (leads[0] !== leads[1]) return leads[0] ? [first, second] : [second, first];
        const entered = [
            first.enteredFromOutside(layout, second),
            second.enteredFromOutside(layout, first),
        ];
        if (entered[0] === entered[1]) return undefined;
        return entered[0] ? [first, second] : [second, first];
    }
}

/** The ends of each sequence flow of the drawing, a boundary event's as its host's. */
function sequenceEndsOf(layout: LayoutModel): { source: string; target: string }[] {
    return [...layout.edges.values()].flatMap((edge) => {
        const ends = carriesSequence(edge) ? neighboursJoinedBy(layout, edge) : undefined;
        return ends === undefined ? [] : [ends];
    });
}

/** Which shapes the side's sequence flows and associations join, and which of them a sequence flow does. */
function joinedBy(side: LayoutModel): {
    readonly neighbours: ReadonlyMap<string, ReadonlySet<string>>;
    readonly inSequence: ReadonlySet<string>;
} {
    const neighbours = new Map<string, Set<string>>();
    const inSequence = new Set<string>();
    const join = (from: string, to: string) => {
        const joined = neighbours.get(from);
        if (joined === undefined) neighbours.set(from, new Set([to]));
        else joined.add(to);
    };
    for (const edge of side.edges.values()) {
        const ends = neighboursJoinedBy(side, edge);
        if (ends === undefined) continue;
        join(ends.source, ends.target);
        join(ends.target, ends.source);
        if (carriesSequence(edge)) {
            inSequence.add(ends.source);
            inSequence.add(ends.target);
        }
    }
    return { neighbours, inSequence };
}
