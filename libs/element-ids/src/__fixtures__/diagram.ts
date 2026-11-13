import type { DiagramElementLike, ElementRegistryLike, ModdleElementLike } from "../candidates";
import { bpmn } from "./moddle";

/** A moddle element as bpmn-moddle would hand it over, minus everything the review never reads. */
export interface FakeModdleElement extends ModdleElementLike {
    id: string;
    name?: string;
    processRef?: FakeModdleElement;
}

export interface FakeElement extends DiagramElementLike {
    id: string;
    businessObject: FakeModdleElement;
    label?: FakeElement;
    labelTarget?: FakeElement;
    di?: { id?: string };
}

export function moddle(type: string, id: string, name?: string): FakeModdleElement {
    return bpmn.create(type, { id, ...(name === undefined ? {} : { name }) }) as FakeModdleElement;
}

export function shape(
    type: string,
    id: string,
    name?: string,
    extra: Partial<FakeElement> = {},
): FakeElement {
    return { id, type, businessObject: moddle(type, id, name), di: { id: `${id}_di` }, ...extra };
}

export function labelOf(element: FakeElement): FakeElement {
    const label: FakeElement = {
        id: `${element.id}_label`,
        type: "label",
        businessObject: element.businessObject,
        labelTarget: element,
    };
    element.label = label;
    return label;
}

/** An element registry and an ID registry over the same elements, like bpmn-js keeps them. */
export function fakeDiagram(elements: FakeElement[], extraIds: Record<string, unknown> = {}) {
    const registry: ElementRegistryLike & { updateId(element: FakeElement, id: string): void } = {
        getAll: () => elements,
        get: (id) => elements.find((element) => element.id === id),
        updateId: (element, id) => {
            element.id = id;
        },
    };
    const ids = {
        assigned(id: string): unknown {
            if (id in extraIds) {
                return extraIds[id];
            }
            for (const element of elements) {
                if (element.businessObject.id === id && !element.labelTarget) {
                    return element.businessObject;
                }
                if (element.di?.id === id) {
                    return element.di;
                }
                if (element.businessObject.processRef?.id === id) {
                    return element.businessObject.processRef;
                }
            }
            return false;
        },
    };
    return { registry, moddle: { ids } };
}
