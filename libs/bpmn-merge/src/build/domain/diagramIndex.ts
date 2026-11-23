import {
    type ModdleElement,
    idOf,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import { contentsPlaneOf } from "./containerContents";
import type { ItemKey } from "../../kernel/domain/memberOrder";

export interface Drawing {
    readonly element: ModdleElement;
    /** The semantic element the drawing's plane draws; "" for a plane that names none. */
    readonly planeOwner: string;
}

/**
 * One document's diagrams, a version's read before its semantic tree is taken apart. It
 * answers which of an element's drawings a reader takes, so no reader picks its own.
 */
export class DiagramIndex {
    private constructor(
        readonly diagrams: readonly ModdleElement[],
        private readonly diagramsByPlaneOwner: ReadonlyMap<string, ModdleElement>,
        /** Shapes and edges by the id of the element they draw ("" for none). */
        private readonly drawingsByElement: ReadonlyMap<string, readonly Drawing[]>,
        /** Each plane's drawings in document order, by `drawingKeyOf`. */
        readonly orderByPlaneOwner: ReadonlyMap<string, readonly ItemKey[]>,
        /** Plane owners that are sub-processes: each has a plane of its own in the result. */
        private readonly subProcessPlaneOwners: ReadonlySet<string>,
        readonly collaborationPlaneOwners: ReadonlySet<string>,
    ) {}

    static of(definitions: ModdleElement): DiagramIndex {
        const diagrams = moddleElements(definitions.diagrams);
        const diagramsByPlaneOwner = new Map<string, ModdleElement>();
        const subProcessPlaneOwners = new Set<string>();
        const collaborationPlaneOwners = new Set<string>();
        const drawingsByElement = new Map<string, Drawing[]>();
        const orderByPlaneOwner = new Map<string, ItemKey[]>();
        for (const diagram of diagrams) {
            const plane = diagram.plane as ModdleElement | undefined;
            const planeOwner = planeOwnerOf(diagram);
            if (!diagramsByPlaneOwner.has(planeOwner)) {
                diagramsByPlaneOwner.set(planeOwner, diagram);
            }
            if (isPlaneOwnerOfType(plane, "bpmn:SubProcess")) subProcessPlaneOwners.add(planeOwner);
            if (isPlaneOwnerOfType(plane, "bpmn:Collaboration")) {
                collaborationPlaneOwners.add(planeOwner);
            }
            const order: ItemKey[] = [];
            for (const drawing of moddleElements(plane?.planeElement)) {
                const elementId = idOf(drawing.bpmnElement) ?? "";
                drawingsByElement.set(elementId, [
                    ...(drawingsByElement.get(elementId) ?? []),
                    { element: drawing, planeOwner },
                ]);
                order.push(drawingKeyOf(drawing));
            }
            orderByPlaneOwner.set(planeOwner, [
                ...(orderByPlaneOwner.get(planeOwner) ?? []),
                ...order,
            ]);
        }
        return new DiagramIndex(
            diagrams,
            diagramsByPlaneOwner,
            drawingsByElement,
            orderByPlaneOwner,
            subProcessPlaneOwners,
            collaborationPlaneOwners,
        );
    }

    /** The diagram a result keeps for a plane owner: its first, in document order. */
    diagramOf(planeOwner: string): ModdleElement | undefined {
        return this.diagramsByPlaneOwner.get(planeOwner);
    }

    /** Each plane owner once, in the order of its first diagram. */
    planeOwnersInDocumentOrder(): readonly string[] {
        return [...this.diagramsByPlaneOwner.keys()];
    }

    /** Each id with drawings, in the order first drawn; "" stands for the drawings that name no element. */
    drawnIds(): readonly string[] {
        return [...this.drawingsByElement.keys()];
    }

    /** The elements drawn with a shape or an edge: `drawnIds` without "". */
    drawnElements(): readonly string[] {
        return this.drawnIds().filter((id) => id !== "");
    }

    elementsDrawnMoreThanOnce(): readonly string[] {
        return this.drawnElements().filter((element) => this.drawingsOf(element).length > 1);
    }

    /** Whether a shape or an edge draws the element; a plane does not count. */
    draws(element: string): boolean {
        return this.drawingsByElement.has(element);
    }

    /** Every drawing of the element, in diagram order; a reader that takes one asks for it by name instead. */
    drawingsOf(element: string): readonly Drawing[] {
        return this.drawingsByElement.get(element) ?? [];
    }

    /** The plane the element's first drawing lies on, which a checked result draws it on alone. */
    planeOf(element: string): string | undefined {
        return this.drawingsOf(element)[0]?.planeOwner;
    }

    hasSubProcessPlane(planeOwner: string): boolean {
        return this.subProcessPlaneOwners.has(planeOwner);
    }

    /** The plane owner whose plane holds the sub-process's contents in this document. */
    subProcessContentsPlane(subProcess: string): string | undefined {
        return contentsPlaneOf(
            this.diagramsByPlaneOwner.has(subProcess) ? subProcess : undefined,
            this.placedShapeOf(subProcess),
            (shape) => shape.planeOwner,
        );
    }

    /** The shape drawing the element that the layout reads and a repair writes: its first with bounds, in diagram order. */
    shapeDrawingOf(element: string): Drawing | undefined {
        return this.drawingsOf(element).find(
            ({ element: drawing }) =>
                isType(drawing, "bpmndi:BPMNShape") && isModdleElement(drawing.bounds),
        );
    }

    /** The shape of an element a result carries, which its contents' plane follows: the one the layout reads, else its first. */
    placedShapeOf(element: string): Drawing | undefined {
        return (
            this.shapeDrawingOf(element) ??
            this.drawingsOf(element).find(({ element: drawing }) =>
                isType(drawing, "bpmndi:BPMNShape"),
            )
        );
    }

    /** The drawings of an element a result takes from this index: only the edge or shape it carries, or every drawing that names no element. */
    placedDrawingsOf(element: string): readonly Drawing[] {
        const drawings = this.drawingsOf(element);
        if (element === "") return drawings;
        const placed = this.flowDrawingOf(element) ?? this.placedShapeOf(element);
        return placed === undefined ? drawings : [placed];
    }

    /** The edge drawing the flow that the layout reads and a repair writes: its first, in diagram order. */
    flowDrawingOf(flow: string): Drawing | undefined {
        return this.drawingsOf(flow).find(({ element }) => isType(element, "bpmndi:BPMNEdge"));
    }
}

/**
 * A root plane draws a process or a collaboration, the canvas no shape names;
 * a sub-process plane draws a collapsed sub-process's contents.
 */
export type PlaneKind = "root" | "subProcess";

export const ROOT_PLANE: PlaneKind = "root";

/** The plane's kind: a sub-process plane in any of the indexes is one. */
export function planeKindOf(planeOwner: string, ...indexes: readonly DiagramIndex[]): PlaneKind {
    return indexes.some((index) => index.hasSubProcessPlane(planeOwner))
        ? "subProcess"
        : ROOT_PLANE;
}

/** A drawing is known by the element it draws, not by its DI id, which the sides may give two different drawings. */
export function drawingKeyOf(drawing: ModdleElement): ItemKey {
    return idOf(drawing.bpmnElement) ?? drawing;
}

function planeOwnerOf(diagram: ModdleElement): string {
    return idOf((diagram.plane as ModdleElement | undefined)?.bpmnElement) ?? "";
}

function isPlaneOwnerOfType(plane: ModdleElement | undefined, type: string): boolean {
    return isModdleElement(plane?.bpmnElement) && isType(plane.bpmnElement, type);
}
