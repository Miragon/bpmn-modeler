import type { DrawingDraft } from "./layoutDrawingDraft";
import { InsertedChain } from "./layoutInsertedChains";
import { type RoomContext, type RoomForGroup, makeRoomInLine } from "./layoutMakeRoom";
import type { LayoutModel, NodeShape } from "./layoutModel";
import { leadAlong } from "./layoutSpaceTool";

/** What giving a chain room reads beside the draft: what moves with a node, how the flows join the nodes and the sides' drawings. */
type ChainRoomContext = RoomContext & { readonly sides: readonly LayoutModel[] };

/**
 * Room for the chains two shapes that lie on each other belong to, with the
 * chain that was placed as its group; undefined where the attempt does not
 * apply or finds none.
 */
export type ChainRoomAttempt = (
    draft: DrawingDraft,
    context: ChainRoomContext,
    pair: readonly [NodeShape, NodeShape],
) => RoomForGroup | undefined;

/** Whether the flows at the chains run to the right where the draft draws them: room in line is made only that way. */
function flowsRight(
    draft: DrawingDraft,
    { topology }: ChainRoomContext,
    chains: readonly InsertedChain[],
): boolean {
    return topology.flowsRightAt(
        draft,
        chains.flatMap(({ nodes }) => nodes.map(({ id }) => id)),
    );
}

/**
 * Room in line for two chains that lie on each other, one from each side:
 * each stays as its side drew it, the one the flows put first where it lies,
 * the other behind it, and everything after them shifts on as the space tool
 * shifts it. Only for chains in the flow, at least one of several steps: two
 * single steps are stacked or put in line as shapes. Undefined where the
 * flows order the two neither way or do not run to the right.
 */
export const twoChainsInLine: ChainRoomAttempt = (draft, context, pair) => {
    const [first, second] = pair.map((node) => InsertedChain.of(draft, context.sides, node));
    if (first === undefined || second === undefined) return undefined;
    if (!first.liesInTheFlow || !second.liesInTheFlow) return undefined;
    if (!first.hasSeveralSteps && !second.hasSeveralSteps) return undefined;
    const ordered = InsertedChain.inFlowOrder(draft, first, second);
    if (ordered === undefined || !flowsRight(draft, context, ordered)) return undefined;
    const [ahead, behind] = ordered.map((chain) => chain.groupIn(context.groups, draft));
    const room = makeRoomInLine(draft, context, ahead!.node.bounds.x, ahead!, behind!);
    return room === undefined ? undefined : { ...room, group: behind! };
};

/**
 * Room for a chain of several steps that lies on a shape both sides draw
 * which it leads into: the chain stays where it is drawn, beside the shape
 * it follows, and the shape gives way with everything after the chain's
 * first shape, as the space tool shifts it. Only where the chain's flows run
 * to the right.
 */
export const chainBeforeWhatItLeadsInto: ChainRoomAttempt = (draft, context, pair) => {
    const chains = pair.map((node) => InsertedChain.of(draft, context.sides, node));
    const at = chains.findIndex((chain) => chain !== undefined);
    const chain = chains[at];
    const next = pair[1 - at];
    if (chain === undefined || next === undefined || chains[1 - at] !== undefined) {
        return undefined;
    }
    if (!chain.hasSeveralSteps || !chain.leadsInto(draft, next)) return undefined;
    if (!flowsRight(draft, context, [chain])) return undefined;
    const group = chain.groupIn(context.groups, draft);
    const line = Math.min(group.node.bounds.x, leadAlong("x", next));
    const room = makeRoomInLine(draft, context, line, group);
    return room === undefined ? undefined : { ...room, group };
};

/**
 * The rooms for chains, each tried over every overlap before the next: two
 * chains are put in line before one of them makes the shapes after it give
 * way, which would take the other along as one of those.
 */
export const CHAIN_ROOMS: readonly ChainRoomAttempt[] = [
    twoChainsInLine,
    chainBeforeWhatItLeadsInto,
];
