/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim: moddle-element helpers (create / id / root lookup) used by the
 * error/message/signal/escalation reference entries.
 */
import { Ids } from "ids";

import { is } from "bpmn-js/lib/util/ModelUtil";

export function createElement(type: string, properties: any, parent: any, bpmnFactory: any): any {
    const element = bpmnFactory.create(type, properties);

    if (parent) {
        element.$parent = parent;
    }

    return element;
}

export function nextId(prefix: string): string {
    const ids = new Ids([32, 32, 1]);

    return ids.nextPrefixed(prefix);
}

export function getRoot(businessObject: any): any {
    let parent = businessObject;

    while (parent.$parent) {
        parent = parent.$parent;
    }

    return parent;
}

function filterElementsByType(objectList: any[], type: string): any[] {
    const list = objectList || [];

    return list.filter((element) => is(element, type));
}

export function findRootElementsByType(businessObject: any, referencedType: string): any[] {
    const root = getRoot(businessObject);

    return filterElementsByType(root.get("rootElements"), referencedType);
}

export function findRootElementById(businessObject: any, type: string, id: string): any {
    const elements = findRootElementsByType(businessObject, type);

    return elements.find((element) => element.id === id);
}
