import type { DrawingDraft } from "./layoutDrawingDraft";
import { InsertedChain } from "./layoutInsertedChains";
import {
    type RoomContext,
    type RoomForGroup,
    type RoomMade,
    makeRoomInLine,
} from "./layoutMakeRoom";
import type { LayoutModel, NodeShape } from "./layoutModel";
import type { ShapeGroup } from "./layoutShapeGroups";
import { leadAlong } from "./layoutSpaceTool";

/** What giving a chain room reads beside the draft: what moves with a node, how the flows join the nodes and the sides' drawings. */
type ChainRoomContext = RoomContext & { readonly sides: readonly LayoutModel[] };

/**
 * Room for the chains two shapes that lie on each other belong to, with the
 * chain that was placed as its group and named after that chain's shape of
 * the pair; undefined where the attempt does not apply or finds none.
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

/** The room for the chain, named after the chain's shape of the pair, its host for a boundary event. */
function roomNaming(
    room: RoomMade | undefined,
    chain: ShapeGroup,
    ofPair: NodeShape,
): RoomForGroup | undefined {
    return room === undefined
        ? undefined
        : { ...room, group: chain, named: ofPair.host ?? ofPair.id };
}

/**
 * Room in line for two chains that lie on each other, one from each side:
 * each stays as its side drew it, the one the flows put first where it lies,
 * the other behind it, and everything after them shifts on as the space tool
 * shifts it. Undefined where the two are not put in line as chains
 * (`InsertedChain.toPutInLine`) or their flows do not run to the right.
 */
export const twoChainsInLine: ChainRoomAttempt = (draft, context, pair) => {
    const [first, second] = pair.map((node) => InsertedChain.of(draft, context.sides, node));
    if (first === undefined || second === undefined) return undefined;
    const ordered = InsertedChain.toPutInLine(context.topology, first, second);
    if (ordered === undefined || !flowsRight(draft, context, ordered)) return undefined;
    const [ahead, behind] = ordered.map((chain) => chain.groupIn(context.groups, draft));
    const room = makeRoomInLine(draft, context, ahead!.node.bounds.x, ahead!, behind!);
    return roomNaming(room, behind!, pair[ordered[1] === first ? 0 : 1]);
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
    if (!chain.hasSeveralSteps || !chain.leadsInto(context.topology, next)) return undefined;
    if (!flowsRight(draft, context, [chain])) return undefined;
    const group = chain.groupIn(context.groups, draft);
    const line = Math.min(group.node.bounds.x, leadAlong("x", next));
    return roomNaming(makeRoomInLine(draft, context, line, group), group, pair[at]!);
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
