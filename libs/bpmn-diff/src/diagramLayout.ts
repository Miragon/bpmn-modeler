import { type ModdleElement, isModdleElement, moddleElements } from "./moddleElement";
import { isNamespaceDeclaration } from "./namespaceDeclarations";

type CanonicalValue = string | number | boolean | CanonicalObject | CanonicalValue[] | undefined;
interface CanonicalObject {
    [name: string]: CanonicalValue;
}

const NESTED_OMITTED = new Set(["id"]);
const DRAWING_OMITTED = new Set(["id", "bpmnElement"]);
const PLANE_OMITTED = new Set(["id", "bpmnElement", "planeElement"]);

interface DiagramLayout {
    /** Canonical text of every diagram element that draws the element. */
    readonly text: string;
    /** The `bpmnElement` id of the plane holding its first shape or edge. */
    readonly plane?: string;
    /** Canonical text of the bounds of every shape that draws the element, without labels or attributes. */
    readonly place?: string;
}

/**
 * For every semantic element drawn in `definitions`, a canonical text of the
 * diagram elements that draw it: shapes and edges with their bounds, labels,
 * waypoints and own attributes, and a plane of its own (a collapsed
 * sub-process's); and apart from it the bounds of its shapes alone, which
 * a colour, a label or an edge does not change. DI ids, attribute order, number spelling and defaults the
 * file does not set do not change it: a DI reference is written by the
 * element its target draws, a label style by its content.
 */
export function diagramLayouts(definitions: ModdleElement): Map<ModdleElement, DiagramLayout> {
    const drawingsByElement = new Map<ModdleElement, CanonicalObject[]>();
    const planeByElement = new Map<ModdleElement, string | undefined>();
    const placesByElement = new Map<ModdleElement, CanonicalObject[]>();
    const addDrawing = (element: unknown, drawing: CanonicalObject) => {
        if (!isModdleElement(element)) return;
        const drawings = drawingsByElement.get(element) ?? [];
        drawings.push(drawing);
        drawingsByElement.set(element, drawings);
    };
    for (const diagram of moddleElements(definitions.diagrams)) {
        const plane = diagram.plane;
        if (!isModdleElement(plane)) continue;
        const planeElement = plane.bpmnElement;
        addDrawing(planeElement, canonical(plane, PLANE_OMITTED));
        const planeId = isModdleElement(planeElement) ? planeElement.id : undefined;
        for (const drawing of moddleElements(plane.planeElement)) {
            const drawnElement = drawing.bpmnElement;
            addDrawing(drawnElement, { ...canonical(drawing, DRAWING_OMITTED), plane: planeId });
            if (isModdleElement(drawnElement) && isModdleElement(drawing.bounds)) {
                const places = placesByElement.get(drawnElement) ?? [];
                places.push(canonical(drawing.bounds, NESTED_OMITTED));
                placesByElement.set(drawnElement, places);
            }
            if (isModdleElement(drawnElement) && !planeByElement.has(drawnElement))
                planeByElement.set(drawnElement, planeId);
        }
    }
    return new Map(
        [...drawingsByElement].map(([element, drawings]) => {
            const plane = planeByElement.get(element);
            const places = placesByElement.get(element);
            return [
                element,
                {
                    text: JSON.stringify(drawings.map(sortedKeys)),
                    ...(plane === undefined ? {} : { plane }),
                    ...(places === undefined
                        ? {}
                        : { place: JSON.stringify(places.map(sortedKeys)) }),
                },
            ];
        }),
    );
}

/**
 * Own properties only: moddle answers unset DI flags with their defaults.
 * Typed properties go by their qualified name, since `bioc` and `color` extend
 * the DI types with local names of their own.
 */
function canonical(element: ModdleElement, omitted: ReadonlySet<string>): CanonicalObject {
    const result: CanonicalObject = { type: element.$type };
    for (const name of Object.getOwnPropertyNames(element)) {
        if (name.startsWith("$") || omitted.has(name) || isNamespaceDeclaration(name)) continue;
        const property = element.$descriptor.properties?.find(
            (candidate) => candidate.name === name,
        );
        result[property?.ns?.name ?? name] = canonicalValue(
            element[name],
            property?.isReference === true,
        );
    }
    for (const [name, value] of Object.entries(element.$attrs ?? {})) {
        if (!isNamespaceDeclaration(name)) result[name] = value;
    }
    if (element.$body !== undefined) result.$body = String(element.$body);
    if (element.$children)
        result.$children = element.$children.map((child) => canonicalValue(child, false));
    return sortedKeys(result);
}

function canonicalValue(value: unknown, isReference: boolean): CanonicalValue {
    if (Array.isArray(value)) return value.map((item) => canonicalValue(item, isReference));
    if (isModdleElement(value))
        return isReference ? canonicalReference(value) : canonical(value, NESTED_OMITTED);
    return value as CanonicalValue;
}

function canonicalReference(target: ModdleElement): CanonicalValue {
    return isModdleElement(target.bpmnElement)
        ? target.bpmnElement.id
        : canonical(target, NESTED_OMITTED);
}

function sortedKeys(object: CanonicalObject): CanonicalObject {
    return Object.fromEntries(
        Object.entries(object).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
        ),
    );
}
