import { type ModdleElement, isModdleElement } from "@miragon/bpmn-modeler-diff";

import {
    type ConnectionEnds,
    type UndrawnEdge,
    connectionEndsOf,
    edgePlaneOf,
} from "./connectionEnds";
import { contentsPlaneOf, enclosingSubProcessOf } from "./containerContents";
import { type DiagramIndex, type Drawing, drawingKeyOf } from "./diagramIndex";
import type { DrawingSides } from "./drawingSides";
import type { ItemKey } from "../../kernel/domain/memberOrder";
import { MERGE_SIDES, type MergeSide } from "../../kernel/domain/mergeResult";
import type { PlaneSlot, PlaneSlots } from "./planeSlots";

export interface PlaneAssignmentSources {
    readonly indexes: Readonly<Record<MergeSide, DiagramIndex>>;
    readonly drawingSides: DrawingSides;
    readonly resultUnits: ReadonlyMap<string, ModdleElement>;
    readonly slots: PlaneSlots;
    /** The result's slots in order: a drawing whose own root slot the result lacks goes on the first root one. */
    readonly keptSlots: readonly PlaneSlot[];
}

interface PendingEdge {
    readonly elementId: string;
    readonly drawing: Drawing;
    readonly ends: ConnectionEnds;
}

/**
 * Which slot of the result each drawing the result takes goes on. A shape goes onto the plane
 * its sub-process's DI in the result implies (`contentsPlaneOf`), an edge onto the plane that
 * draws both its ends (`edgePlaneOf`), and a drawing of no decided element and no part stays
 * where current draws it.
 */
export class PlaneAssignment {
    private readonly keptSlots: ReadonlySet<PlaneSlot>;
    private readonly firstRootSlot: PlaneSlot | undefined;
    private readonly contentsSlots = new Map<string, PlaneSlot | undefined>();
    private readonly membersBySlot = new Map<PlaneSlot, Map<ItemKey, ModdleElement>>();
    private readonly slotsOfDrawn = new Map<string, PlaneSlot>();
    private readonly pendingEdges: PendingEdge[] = [];
    /** The edges no slot draws both ends of, which stay out of the drawing. */
    readonly undrawnEdges: readonly UndrawnEdge[];

    private constructor(private readonly sources: PlaneAssignmentSources) {
        this.keptSlots = new Set(sources.keptSlots);
        this.firstRootSlot = sources.keptSlots.find((slot) => slot.isRoot);
        this.placeTakenDrawings();
        this.undrawnEdges = this.placeEdges();
    }

    static of(sources: PlaneAssignmentSources): PlaneAssignment {
        return new PlaneAssignment(sources);
    }

    /** The slot's drawings by `drawingKeyOf`, in the order they were placed. */
    membersOf(slot: PlaneSlot): ReadonlyMap<ItemKey, ModdleElement> {
        return this.membersBySlot.get(slot) ?? new Map<ItemKey, ModdleElement>();
    }

    private placeTakenDrawings(): void {
        const { indexes, drawingSides, slots } = this.sources;
        for (const side of MERGE_SIDES) {
            for (const elementId of indexes[side].drawnIds()) {
                if (drawingSides.takenSideOf(elementId) !== side) continue;
                const staysPut = drawingSides.staysWhereCurrentDraws(elementId);
                for (const drawing of indexes[side].placedDrawingsOf(elementId)) {
                    const slot = staysPut
                        ? slots.slotOf(drawing.planeOwner)
                        : this.slotOfElement(elementId, drawing);
                    this.place(elementId, drawing, slot);
                }
            }
        }
    }

    private place(elementId: string, drawing: Drawing, slot: PlaneSlot | undefined): void {
        const drawn = drawing.element.bpmnElement;
        const ends = isModdleElement(drawn) ? connectionEndsOf(drawn) : undefined;
        if (ends !== undefined) {
            this.pendingEdges.push({ elementId, drawing, ends });
        } else if (slot !== undefined && this.keptSlots.has(slot)) {
            this.slotsOfDrawn.set(elementId, slot);
            this.addMember(drawing, slot);
        }
    }

    private slotOfElement(elementId: string, drawing: Drawing): PlaneSlot | undefined {
        const { drawingSides, resultUnits, slots } = this.sources;
        const subProcess = enclosingSubProcessOf(
            drawingSides.isPart(elementId)
                ? (drawing.element.bpmnElement as ModdleElement)
                : resultUnits.get(elementId),
        );
        if (subProcess !== undefined) return this.contentsSlotOf(subProcess);
        const own = slots.slotOf(drawing.planeOwner);
        return this.keptSlots.has(own) && own.isRoot ? own : this.firstRootSlot;
    }

    private contentsSlotOf(subProcess: string): PlaneSlot | undefined {
        if (!this.contentsSlots.has(subProcess)) {
            const { indexes, drawingSides, slots } = this.sources;
            const ownSlot = slots.slotOf(subProcess);
            const side = drawingSides.sides[subProcess];
            const shape = side === undefined ? undefined : indexes[side].placedShapeOf(subProcess);
            this.contentsSlots.set(
                subProcess,
                contentsPlaneOf(
                    this.keptSlots.has(ownSlot) ? ownSlot : undefined,
                    shape,
                    (subProcessShape) => this.slotOfElement(subProcess, subProcessShape),
                ) ?? this.firstRootSlot,
            );
        }
        return this.contentsSlots.get(subProcess);
    }

    /** An end that is itself an edge is resolved first; an edge no slot draws both ends of stays out. */
    private placeEdges(): UndrawnEdge[] {
        const edgesById = new Map(this.pendingEdges.map((edge) => [edge.elementId, edge] as const));
        const resolving = new Set<string>();
        const slotOfEnd = (id: string): PlaneSlot | undefined => {
            const edge = edgesById.get(id);
            if (this.slotsOfDrawn.has(id) || edge === undefined || resolving.has(id)) {
                return this.slotsOfDrawn.get(id);
            }
            resolving.add(id);
            const slot = edgePlaneOf(edge.ends, slotOfEnd);
            if (slot !== undefined) this.slotsOfDrawn.set(id, slot);
            return slot;
        };
        return this.pendingEdges.flatMap(({ elementId, drawing, ends }): UndrawnEdge[] => {
            const slot = slotOfEnd(elementId);
            if (slot === undefined) return [{ id: elementId, ends }];
            this.addMember(drawing, slot);
            return [];
        });
    }

    private addMember(drawing: Drawing, slot: PlaneSlot): void {
        const members = this.membersBySlot.get(slot) ?? new Map<ItemKey, ModdleElement>();
        members.set(drawingKeyOf(drawing.element), drawing.element);
        this.membersBySlot.set(slot, members);
    }
}
