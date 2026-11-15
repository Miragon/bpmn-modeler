import {
    type ModdleElement,
    idOf,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import { contentsPlaneOf } from "./containerContents";
import type { ItemKey } from "./mergedTreeOrder";

export interface DiagramBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface Drawing {
    readonly element: ModdleElement;
    /** The semantic element the drawing's plane draws; "" for a plane that names none. */
    readonly planeOwner: string;
}

/** One document's diagrams, a version's read before its semantic tree is taken apart. */
export interface DiagramIndex {
    readonly diagrams: readonly ModdleElement[];
    readonly planeOwners: ReadonlySet<string>;
    /** Shapes and edges by the id of the element they draw ("" for none). */
    readonly drawingsByElement: ReadonlyMap<string, readonly Drawing[]>;
    /** Each plane's drawings in document order, by `drawingKeyOf`. */
    readonly orderByPlaneOwner: ReadonlyMap<string, readonly ItemKey[]>;
    /** Plane owners that are sub-processes: each has a plane of its own in the result. */
    readonly subProcessPlaneOwners: ReadonlySet<string>;
    readonly collaborationPlaneOwners: ReadonlySet<string>;
    /** Each collaboration with the processes its participants name: one root plane draws them. */
    readonly collaborationProcesses: readonly (readonly [string, string])[];
}

export function diagramIndexOf(definitions: ModdleElement): DiagramIndex {
    const diagrams = moddleElements(definitions.diagrams);
    const planeOwners = new Set<string>();
    const subProcessPlaneOwners = new Set<string>();
    const collaborationPlaneOwners = new Set<string>();
    const drawingsByElement = new Map<string, Drawing[]>();
    const orderByPlaneOwner = new Map<string, ItemKey[]>();
    for (const diagram of diagrams) {
        const plane = diagram.plane as ModdleElement | undefined;
        const planeOwner = planeOwnerOf(diagram);
        planeOwners.add(planeOwner);
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
        orderByPlaneOwner.set(planeOwner, [...(orderByPlaneOwner.get(planeOwner) ?? []), ...order]);
    }
    const collaborationProcesses = moddleElements(definitions.rootElements)
        .filter((root) => isType(root, "bpmn:Collaboration"))
        .flatMap((collaboration) =>
            moddleElements(collaboration.participants).flatMap((participant) => {
                const processId = idOf(participant.processRef);
                return collaboration.id === undefined || processId === undefined
                    ? []
                    : [[collaboration.id, processId] as const];
            }),
        );
    return {
        diagrams,
        planeOwners,
        drawingsByElement,
        orderByPlaneOwner,
        subProcessPlaneOwners,
        collaborationPlaneOwners,
        collaborationProcesses,
    };
}

/** The plane owner whose plane holds the sub-process's contents in this document. */
export function contentsPlaneIn(index: DiagramIndex, subProcess: string): string | undefined {
    return contentsPlaneOf(
        index.planeOwners.has(subProcess) ? subProcess : undefined,
        index.drawingsByElement.get(subProcess)?.[0],
        (shape) => shape.planeOwner,
    );
}

/** The bounds of the shape that draws the element, if a shape does. */
export function boundsIn(index: DiagramIndex, elementId: string): DiagramBounds | undefined {
    const bounds = index.drawingsByElement
        .get(elementId)
        ?.map(({ element }) => element.bounds)
        .find(isModdleElement);
    return bounds
        ? {
              x: Number(bounds.x),
              y: Number(bounds.y),
              width: Number(bounds.width),
              height: Number(bounds.height),
          }
        : undefined;
}

/** A drawing is known by the element it draws, not by its DI id, which the sides may give two different drawings. */
export function drawingKeyOf(drawing: ModdleElement): ItemKey {
    return idOf(drawing.bpmnElement) ?? drawing;
}

export function planeOwnerOf(diagram: ModdleElement): string {
    return idOf((diagram.plane as ModdleElement | undefined)?.bpmnElement) ?? "";
}

function isPlaneOwnerOfType(plane: ModdleElement | undefined, type: string): boolean {
    return isModdleElement(plane?.bpmnElement) && isType(plane.bpmnElement, type);
}
