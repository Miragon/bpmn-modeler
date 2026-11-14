import { type ModdleElement, idOf, isModdleElement } from "@miragon/bpmn-modeler-diff";

import { contentsPlaneOf, enclosingSubProcessOf } from "./containerContents";
import { type DiagramIndex, type Drawing, planeOwnerOf } from "./diagramIndex";
import type { MergeResolution } from "./mergeDecisions";
import { type ItemKey, itemKeyOf, orderMembers } from "./mergedTreeOrder";
import { MERGE_SIDES, type MergeSide } from "./mergeResult";

/** Elements whose layout side draws them with a shape or an edge, not only with a plane. */
export function drawnByShape(
    indexes: Readonly<Record<MergeSide, DiagramIndex>>,
    layoutSides: Readonly<Record<string, MergeSide>>,
): Set<string> {
    return new Set(
        Object.entries(layoutSides)
            .filter(([id, side]) => (indexes[side].drawingsByElement.get(id)?.length ?? 0) > 0)
            .map(([id]) => id),
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
 * preferring a collaboration, under current's root diagram id), and each
 * element's shapes and edges from its layout side, translated only by taking
 * that side's DI. A drawing goes onto the plane its sub-process's DI in the
 * result implies (`contentsPlaneOf`). Drawings of no decided element stay
 * current's.
 */
export function assembleDiagrams(
    definitions: ModdleElement,
    indexes: Readonly<Record<MergeSide, DiagramIndex>>,
    resolution: MergeResolution,
    resultUnits: ReadonlyMap<string, ModdleElement>,
): void {
    const layoutSides = resolution.layout;
    const decidedIds = new Set(Object.keys(resolution.elements));
    const slots = new PlaneSlots(indexes);
    const kept = keptDiagramsOf(indexes, slots, layoutSides, decidedIds);
    const slotOrder = (side: MergeSide) => [
        ...new Set(indexes[side].diagrams.map((diagram) => slots.slotOf(planeOwnerOf(diagram)))),
    ];
    const orderedSlots = orderMembers(
        slotOrder("current"),
        slotOrder("incoming"),
        new Set(kept.keys()),
    );
    // A later diagram whose id is taken is left out with its drawings, so the drawn-element check refuses the file.
    const takenIds = new Set<string>();
    definitions.diagrams = orderedSlots
        .map((slot) => kept.get(slot)!.diagram)
        .filter((diagram) => {
            if (diagram.id === undefined) return true;
            const taken = takenIds.has(diagram.id);
            takenIds.add(diagram.id);
            return !taken;
        });

    const contentsSlots = new Map<string, string | undefined>();
    const firstRootSlot = orderedSlots.find((slot) => slots.isRoot(slot));
    const slotOfElement = (elementId: string, drawing: Drawing): string | undefined => {
        const subProcess = enclosingSubProcessOf(resultUnits.get(elementId));
        if (subProcess !== undefined) return contentsSlotOf(subProcess);
        const own = slots.slotOf(drawing.planeOwner);
        return kept.has(own) && slots.isRoot(own) ? own : firstRootSlot;
    };
    const contentsSlotOf = (subProcess: string): string | undefined => {
        if (!contentsSlots.has(subProcess)) {
            const ownSlot = slots.slotOf(subProcess);
            const side = layoutSides[subProcess];
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
    const place = (drawing: Drawing, slot: string | undefined) => {
        if (slot === undefined || !kept.has(slot)) return;
        const members = membersBySlot.get(slot) ?? new Map<ItemKey, ModdleElement>();
        members.set(itemKeyOf(drawing.element), drawing.element);
        membersBySlot.set(slot, members);
    };
    for (const [elementId, drawings] of indexes.current.drawingsByElement) {
        if (!decidedIds.has(elementId)) {
            for (const drawing of drawings) place(drawing, slots.slotOf(drawing.planeOwner));
        } else if (layoutSides[elementId] === "current") {
            for (const drawing of drawings) place(drawing, slotOfElement(elementId, drawing));
        }
    }
    for (const [elementId, drawings] of indexes.incoming.drawingsByElement) {
        if (decidedIds.has(elementId) && layoutSides[elementId] === "incoming") {
            for (const drawing of drawings) place(drawing, slotOfElement(elementId, drawing));
        }
    }
    const slotPlaneOrder = (side: MergeSide, slot: string) =>
        [...indexes[side].orderByPlaneOwner].flatMap(([planeOwner, order]) =>
            slots.slotOf(planeOwner) === slot ? order : [],
        );
    const placed: ModdleElement[] = [];
    for (const slot of orderedSlots) {
        const { plane } = kept.get(slot)!;
        const members = membersBySlot.get(slot) ?? new Map<ItemKey, ModdleElement>();
        plane.planeElement = orderMembers(
            slotPlaneOrder("current", slot),
            slotPlaneOrder("incoming", slot),
            new Set(members.keys()),
        ).map((key) => {
            const drawing = members.get(key)!;
            drawing.$parent = plane;
            placed.push(drawing);
            return drawing;
        });
    }
    repointEdgeEnds(placed);
}

function keptDiagramsOf(
    indexes: Readonly<Record<MergeSide, DiagramIndex>>,
    slots: PlaneSlots,
    layoutSides: Readonly<Record<string, MergeSide>>,
    decidedIds: ReadonlySet<string>,
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
        const { owner, side } =
            slotCandidates.find(({ owner, side }) =>
                indexes[side].collaborationPlaneOwners.has(owner),
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
