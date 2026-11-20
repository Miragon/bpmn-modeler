import {
    type ModdleElement,
    idOf,
    isModdleElement,
    moddleElements,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";

import type { UndrawnEdge } from "./connectionEnds";
import { type DiagramIndex, planeOwnerOf } from "./diagramIndex";
import type { DrawingSides } from "./drawingSides";
import { orderMembers } from "./mergedTreeOrder";
import { MERGE_SIDES, type MergeSide } from "./mergeResult";
import { PlaneAssignment } from "./planeAssignment";
import type { PlaneSlot, PlaneSlots } from "./planeSlots";

interface KeptDiagram {
    readonly diagram: ModdleElement;
    readonly plane: ModdleElement;
}

/**
 * Gives current's definitions the result's diagrams: one per plane slot, each
 * plane from the side `DrawingSides` takes its owner's DI from (the root slot
 * preferring a collaboration that holds a pool, under current's root diagram
 * id), and each element's or part's shapes and edges from that side,
 * translated only by taking that side's DI, on the slot `PlaneAssignment` gives it.
 * Incoming's DI keeps its ids unless the result already uses one, and brings the label
 * styles its drawings use. Returns the edges no plane draws both ends of, which stay out
 * of the drawing.
 */
export function assembleDiagrams(
    definitions: ModdleElement,
    indexes: Readonly<Record<MergeSide, DiagramIndex>>,
    slots: PlaneSlots,
    drawingSides: DrawingSides,
    resultUnits: ReadonlyMap<string, ModdleElement>,
): readonly UndrawnEdge[] {
    const kept = keptDiagramsOf(indexes, slots, drawingSides, resultUnits);
    const slotOrder = (side: MergeSide) => [
        ...new Set(indexes[side].diagrams.map((diagram) => slots.slotOf(planeOwnerOf(diagram)))),
    ];
    const orderedSlots = orderMembers(
        slotOrder("current"),
        slotOrder("incoming"),
        new Set(kept.keys()),
    );
    definitions.diagrams = orderedSlots.map((slot) => kept.get(slot)!.diagram);

    const assignment = PlaneAssignment.of({
        indexes,
        drawingSides,
        resultUnits,
        slots,
        keptSlots: orderedSlots,
    });
    const slotPlaneOrder = (side: MergeSide, slot: PlaneSlot) =>
        [...indexes[side].orderByPlaneOwner].flatMap(([planeOwner, order]) =>
            slots.holds(slot, planeOwner) ? order : [],
        );
    const placed: ModdleElement[] = [];
    for (const slot of orderedSlots) {
        const { diagram, plane } = kept.get(slot)!;
        const members = assignment.membersOf(slot);
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
    return assignment.undrawnEdges;
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
    drawingSides: DrawingSides,
    resultUnits: ReadonlyMap<string, ModdleElement>,
): Map<PlaneSlot, KeptDiagram> {
    const candidates = new Map<PlaneSlot, { owner: string; side: MergeSide }[]>();
    for (const side of MERGE_SIDES) {
        for (const diagram of indexes[side].diagrams) {
            const owner = planeOwnerOf(diagram);
            if (drawingSides.takenSideOf(owner) !== side) continue;
            const slot = slots.slotOf(owner);
            candidates.set(slot, [...(candidates.get(slot) ?? []), { owner, side }]);
        }
    }
    const kept = new Map<PlaneSlot, KeptDiagram>();
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
        const keptDiagram = { diagram, plane: diagram.plane as ModdleElement };
        if (slot.isRoot) takeOverRootIds(keptDiagram, rootDiagramIn(indexes.current, slots, slot));
        kept.set(slot, keptDiagram);
    }
    return kept;
}

/** The diagram of current's that draws in the root slot, whose ids the result's root diagram keeps. */
function rootDiagramIn(
    current: DiagramIndex,
    slots: PlaneSlots,
    slot: PlaneSlot,
): ModdleElement | undefined {
    return current.diagrams.find((candidate) => slots.holds(slot, planeOwnerOf(candidate)));
}

function takeOverRootIds(
    { diagram, plane }: KeptDiagram,
    currentRoot: ModdleElement | undefined,
): void {
    if (currentRoot === undefined || currentRoot === diagram) return;
    diagram.id = currentRoot.id;
    plane.id = (currentRoot.plane as ModdleElement | undefined)?.id;
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
