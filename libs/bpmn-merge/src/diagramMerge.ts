import {
    type ModdleElement,
    idOf,
    isModdleElement,
    moddleElements,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";

import {
    type ConnectionEnds,
    type UndrawnEdge,
    connectionEndsOf,
    edgePlaneOf,
} from "./connectionEnds";
import { contentsPlaneOf, enclosingSubProcessOf } from "./containerContents";
import { type DiagramIndex, type Drawing, drawingKeyOf, planeOwnerOf } from "./diagramIndex";
import type { MergeResolution } from "./mergeDecisions";
import { type ItemKey, orderMembers } from "./mergedTreeOrder";
import { MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";

export interface DrawingSides {
    /** Each drawn element and drawn part of the result with the side whose drawing it takes. */
    readonly sides: Readonly<Record<string, MergeSide>>;
    /** Every part either side holds: one without a side here is not drawn at all. */
    readonly parts: ReadonlySet<string>;
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
    return { sides, parts };
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

/**
 * Where a plane goes in the result. A sub-process's plane is its own slot;
 * a collaboration's plane and the planes of the processes its participants
 * name share one root slot, whichever side wraps a process in a pool.
 */
class PlaneSlots {
    private readonly rootOf = new Map<string, string>();
    private readonly subProcesses: ReadonlySet<string>;

    constructor(indexes: Readonly<Record<MergeSide, DiagramIndex>>) {
        this.subProcesses = new Set([
            ...indexes.current.subProcessPlaneOwners,
            ...indexes.incoming.subProcessPlaneOwners,
        ]);
        for (const [collaboration, process] of [
            ...indexes.current.collaborationProcesses,
            ...indexes.incoming.collaborationProcesses,
        ]) {
            const collaborationRoot = this.root(collaboration);
            const processRoot = this.root(process);
            if (collaborationRoot !== processRoot) this.rootOf.set(processRoot, collaborationRoot);
        }
    }

    slotOf(planeOwner: string): string {
        return this.subProcesses.has(planeOwner)
            ? `subProcess:${planeOwner}`
            : `root:${this.root(planeOwner)}`;
    }

    isRoot(slot: string): boolean {
        return slot.startsWith("root:");
    }

    private root(owner: string): string {
        const parent = this.rootOf.get(owner);
        return parent === undefined ? owner : this.root(parent);
    }
}

interface KeptDiagram {
    readonly diagram: ModdleElement;
    readonly plane: ModdleElement;
}

/**
 * Gives current's definitions the result's diagrams: one per plane slot, the
 * plane of a decided owner from that owner's layout side (the root slot
 * preferring a collaboration that holds a pool, under current's root diagram
 * id), and each element's or part's shapes and edges from its drawing side,
 * translated only by taking that side's DI. A shape goes onto the plane its sub-process's DI
 * in the result implies (`contentsPlaneOf`), an edge onto the plane that draws both its ends
 * (`edgePlaneOf`). Drawings of no decided element and no part stay current's. Incoming's DI
 * keeps its ids unless the result already uses one, and brings the label styles its drawings
 * use. Returns the edges no plane draws both ends of, which stay out of the drawing.
 */
export function assembleDiagrams(
    definitions: ModdleElement,
    indexes: Readonly<Record<MergeSide, DiagramIndex>>,
    resolution: MergeResolution,
    { sides: drawingSides, parts }: DrawingSides,
    resultUnits: ReadonlyMap<string, ModdleElement>,
): UndrawnEdge[] {
    const decidedIds = new Set(Object.keys(resolution.elements));
    const slots = new PlaneSlots(indexes);
    const kept = keptDiagramsOf(indexes, slots, drawingSides, decidedIds, resultUnits);
    const slotOrder = (side: MergeSide) => [
        ...new Set(indexes[side].diagrams.map((diagram) => slots.slotOf(planeOwnerOf(diagram)))),
    ];
    const orderedSlots = orderMembers(
        slotOrder("current"),
        slotOrder("incoming"),
        new Set(kept.keys()),
    );
    definitions.diagrams = orderedSlots.map((slot) => kept.get(slot)!.diagram);

    const contentsSlots = new Map<string, string | undefined>();
    const firstRootSlot = orderedSlots.find((slot) => slots.isRoot(slot));
    const slotOfElement = (elementId: string, drawing: Drawing): string | undefined => {
        const subProcess = enclosingSubProcessOf(
            parts.has(elementId)
                ? (drawing.element.bpmnElement as ModdleElement)
                : resultUnits.get(elementId),
        );
        if (subProcess !== undefined) return contentsSlotOf(subProcess);
        const own = slots.slotOf(drawing.planeOwner);
        return kept.has(own) && slots.isRoot(own) ? own : firstRootSlot;
    };
    const contentsSlotOf = (subProcess: string): string | undefined => {
        if (!contentsSlots.has(subProcess)) {
            const ownSlot = slots.slotOf(subProcess);
            const side = drawingSides[subProcess];
            const shape =
                side === undefined
                    ? undefined
                    : indexes[side].drawingsByElement.get(subProcess)?.[0];
            contentsSlots.set(
                subProcess,
                contentsPlaneOf(kept.has(ownSlot) ? ownSlot : undefined, shape, (subProcessShape) =>
                    slotOfElement(subProcess, subProcessShape),
                ) ?? firstRootSlot,
            );
        }
        return contentsSlots.get(subProcess);
    };

    const membersBySlot = new Map<string, Map<ItemKey, ModdleElement>>();
    const addMember = (drawing: Drawing, slot: string) => {
        const members = membersBySlot.get(slot) ?? new Map<ItemKey, ModdleElement>();
        members.set(drawingKeyOf(drawing.element), drawing.element);
        membersBySlot.set(slot, members);
    };
    const slotsOfDrawn = new Map<string, string>();
    const edges: PendingEdge[] = [];
    const place = (elementId: string, drawing: Drawing, slot: string | undefined) => {
        const drawn = drawing.element.bpmnElement;
        const ends = isModdleElement(drawn) ? connectionEndsOf(drawn) : undefined;
        if (ends !== undefined) {
            edges.push({ elementId, drawing, ends });
        } else if (slot !== undefined && kept.has(slot)) {
            slotsOfDrawn.set(elementId, slot);
            addMember(drawing, slot);
        }
    };
    for (const [elementId, drawings] of indexes.current.drawingsByElement) {
        const side = drawingSides[elementId];
        if (side === undefined && !decidedIds.has(elementId) && !parts.has(elementId)) {
            for (const drawing of drawings) {
                place(elementId, drawing, slots.slotOf(drawing.planeOwner));
            }
        } else if (side === "current") {
            for (const drawing of drawings) {
                place(elementId, drawing, slotOfElement(elementId, drawing));
            }
        }
    }
    for (const [elementId, drawings] of indexes.incoming.drawingsByElement) {
        if (drawingSides[elementId] === "incoming") {
            for (const drawing of drawings) {
                place(elementId, drawing, slotOfElement(elementId, drawing));
            }
        }
    }
    const undrawnEdges = placeEdges(edges, slotsOfDrawn, addMember);
    const slotPlaneOrder = (side: MergeSide, slot: string) =>
        [...indexes[side].orderByPlaneOwner].flatMap(([planeOwner, order]) =>
            slots.slotOf(planeOwner) === slot ? order : [],
        );
    const placed: ModdleElement[] = [];
    for (const slot of orderedSlots) {
        const { diagram, plane } = kept.get(slot)!;
        const members = membersBySlot.get(slot) ?? new Map<ItemKey, ModdleElement>();
        plane.planeElement = orderMembers(
            slotPlaneOrder("current", slot),
            slotPlaneOrder("incoming", slot),
            new Set(members.keys()),
        ).map((key) => {
            const drawing = members.get(key)!;
            drawing.$parent = plane;
            placed.push(drawing);
            carryOverLabelStyle(drawing, diagram, [...kept.values()]);
            return drawing;
        });
    }
    repointEdgeEnds(placed);
    giveIncomingDrawingsUnusedIds(definitions, indexes.incoming);
    return undrawnEdges;
}

interface PendingEdge {
    readonly elementId: string;
    readonly drawing: Drawing;
    readonly ends: ConnectionEnds;
}

/**
 * Puts each edge on the slot that draws both its ends (`edgePlaneOf`), an end that is itself
 * an edge once that edge has its slot; an edge no slot draws both ends of stays out.
 */
function placeEdges(
    edges: readonly PendingEdge[],
    slotsOfDrawn: Map<string, string>,
    addMember: (drawing: Drawing, slot: string) => void,
): UndrawnEdge[] {
    const edgesById = new Map(edges.map((edge) => [edge.elementId, edge] as const));
    const resolving = new Set<string>();
    const slotOfEnd = (id: string): string | undefined => {
        const edge = edgesById.get(id);
        if (slotsOfDrawn.has(id) || edge === undefined || resolving.has(id)) {
            return slotsOfDrawn.get(id);
        }
        resolving.add(id);
        const slot = edgePlaneOf(edge.ends, slotOfEnd);
        if (slot !== undefined) slotsOfDrawn.set(id, slot);
        return slot;
    };
    return edges.flatMap(({ elementId, drawing, ends }): UndrawnEdge[] => {
        const slot = slotOfEnd(elementId);
        if (slot === undefined) return [{ id: elementId, ends }];
        addMember(drawing, slot);
        return [];
    });
}

/**
 * A label style lives in a diagram, which may be another side's than the
 * drawing's: a style the result lacks joins the drawing's diagram, and one the
 * result holds alike under its id is shared.
 */
function carryOverLabelStyle(
    drawing: ModdleElement,
    diagram: ModdleElement,
    keptDiagrams: readonly KeptDiagram[],
): void {
    const label = drawing.label as ModdleElement | undefined;
    const style = label?.labelStyle;
    if (!isModdleElement(style)) return;
    const keptStyles = keptDiagrams.flatMap((kept) => moddleElements(kept.diagram.labelStyle));
    if (keptStyles.includes(style)) return;
    const alike = keptStyles.find(
        (candidate) => candidate.id === style.id && sameDiContent(candidate, style),
    );
    if (alike !== undefined) {
        label!.labelStyle = alike;
        return;
    }
    diagram.labelStyle = [...moddleElements(diagram.labelStyle), style];
    style.$parent = diagram;
}

function sameDiContent(left: ModdleElement, right: ModdleElement): boolean {
    const contentOf = (element: ModdleElement) =>
        JSON.stringify(element, (key, value: unknown) =>
            key === "id" || key.startsWith("$") ? undefined : value,
        );
    return left.$type === right.$type && contentOf(left) === contentOf(right);
}

/** DI ids are not compared between the sides, so two drawings may share one; current's keeps it. */
function giveIncomingDrawingsUnusedIds(definitions: ModdleElement, incoming: DiagramIndex): void {
    const incomingDi = new Set<ModdleElement>();
    for (const diagram of incoming.diagrams) {
        walkContainment(diagram, (element) => incomingDi.add(element));
    }
    const takenIds = new Set<string>();
    const incomingInResult: ModdleElement[] = [];
    walkContainment(definitions, (element) => {
        if (incomingDi.has(element)) incomingInResult.push(element);
        else if (element.id !== undefined) takenIds.add(element.id);
    });
    for (const element of incomingInResult) {
        if (element.id === undefined) continue;
        if (takenIds.has(element.id)) element.id = unusedIdFor(element, takenIds);
        takenIds.add(element.id!);
    }
}

function unusedIdFor(element: ModdleElement, takenIds: ReadonlySet<string>): string {
    const drawnId = idOf(element.bpmnElement);
    const conventional = drawnId === undefined ? undefined : `${drawnId}_di`;
    if (conventional !== undefined && !takenIds.has(conventional)) return conventional;
    for (let suffix = 2; ; suffix++) {
        const candidate = `${element.id}_${suffix}`;
        if (!takenIds.has(candidate)) return candidate;
    }
}

function keptDiagramsOf(
    indexes: Readonly<Record<MergeSide, DiagramIndex>>,
    slots: PlaneSlots,
    layoutSides: Readonly<Record<string, MergeSide>>,
    decidedIds: ReadonlySet<string>,
    resultUnits: ReadonlyMap<string, ModdleElement>,
): Map<string, KeptDiagram> {
    const candidates = new Map<string, { owner: string; side: MergeSide }[]>();
    for (const side of MERGE_SIDES) {
        for (const diagram of indexes[side].diagrams) {
            const owner = planeOwnerOf(diagram);
            const eligible = decidedIds.has(owner)
                ? layoutSides[owner] === side
                : side === "current";
            if (!eligible) continue;
            const slot = slots.slotOf(owner);
            candidates.set(slot, [...(candidates.get(slot) ?? []), { owner, side }]);
        }
    }
    const kept = new Map<string, KeptDiagram>();
    for (const [slot, slotCandidates] of candidates) {
        // bpmn-js draws from a collaboration's plane only what its pools reach.
        const { owner, side } =
            slotCandidates.find(
                ({ owner, side }) =>
                    indexes[side].collaborationPlaneOwners.has(owner) &&
                    moddleElements(resultUnits.get(owner)?.participants).length > 0,
            ) ?? slotCandidates[0]!;
        const diagram =
            diagramDrawing(indexes.current, owner) ?? diagramDrawing(indexes[side], owner)!;
        const plane = diagram.plane as ModdleElement;
        const currentInSlot = indexes.current.diagrams.find(
            (candidate) => slots.slotOf(planeOwnerOf(candidate)) === slot,
        );
        if (slots.isRoot(slot) && currentInSlot !== undefined && currentInSlot !== diagram) {
            diagram.id = currentInSlot.id;
            plane.id = (currentInSlot.plane as ModdleElement | undefined)?.id;
        }
        kept.set(slot, { diagram, plane });
    }
    return kept;
}

/** An edge taken from one side may name the end shapes of that side, which the result replaced by the other's. */
function repointEdgeEnds(placed: readonly ModdleElement[]): void {
    const placedSet = new Set(placed);
    const placedByElement = new Map(
        placed.map((drawing) => [idOf(drawing.bpmnElement), drawing] as const),
    );
    for (const drawing of placed) {
        for (const end of ["sourceElement", "targetElement"]) {
            const target = drawing[end];
            if (!isModdleElement(target) || placedSet.has(target)) continue;
            const replacement = placedByElement.get(idOf(target.bpmnElement));
            if (replacement === undefined) delete drawing[end];
            else drawing[end] = replacement;
        }
    }
}

function diagramDrawing(index: DiagramIndex, owner: string): ModdleElement | undefined {
    return index.diagrams.find((diagram) => planeOwnerOf(diagram) === owner);
}
