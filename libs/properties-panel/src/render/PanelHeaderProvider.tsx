/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 *
 * Delta: the upstream header renders a per-type element icon from the bundled
 * `../icons` SVG set, which ships only in the upstream dist this lib must not
 * import. Icons are cosmetic, so `getElementIcon` returns `undefined` and the
 * header shows the element label + humanised type only. Template-driven icons
 * and documentation refs are likewise dropped (they need the `elementTemplates`
 * service, absent from a neutral modeler).
 */
import { getLabel } from "bpmn-js/lib/features/label-editing/LabelUtil";

import { is, getBusinessObject } from "bpmn-js/lib/util/ModelUtil";

import { isExpanded, isEventSubProcess, isInterrupting } from "bpmn-js/lib/util/DiUtil";

function getConcreteType(element: any): string {
    const { type: elementType } = element;

    let type = getRawType(elementType);

    // (1) event definition types
    const eventDefinition = getEventDefinition(element);

    if (eventDefinition) {
        type = `${getEventDefinitionPrefix(eventDefinition)}${type}`;

        // (1.1) interrupting / non interrupting
        if (
            (is(element, "bpmn:StartEvent") && !isInterrupting(element)) ||
            (is(element, "bpmn:BoundaryEvent") && !isCancelActivity(element))
        ) {
            type = `${type}NonInterrupting`;
        }

        return type;
    }

    // (2) sub process types
    if (is(element, "bpmn:SubProcess") && !is(element, "bpmn:Transaction")) {
        if (isEventSubProcess(element)) {
            type = `Event${type}`;
        } else {
            const expanded = isExpanded(element) && !isPlane(element);
            type = `${expanded ? "Expanded" : "Collapsed"}${type}`;
        }
    }

    // (3) conditional + default flows
    if (isDefaultFlow(element)) {
        type = "DefaultFlow";
    }

    if (isConditionalFlow(element)) {
        type = "ConditionalFlow";
    }

    return type;
}

export const PanelHeaderProvider = (translate?: (text: string) => string) => {
    const t = translate ?? ((text: string) => text);
    return {
        getDocumentationRef: (_element: any): string | undefined => {
            return undefined;
        },

        getElementLabel: (element: any): string | undefined => {
            if (is(element, "bpmn:Process")) {
                return getBusinessObject(element).name;
            }

            return getLabel(element);
        },

        getElementIcon: (_element: any): undefined => {
            return undefined;
        },

        getTypeLabel: (element: any): string => {
            const concreteType = getConcreteType(element);

            return t(
                concreteType.replace(/(\B[A-Z])/g, " $1").replace(/(\bNon Interrupting)/g, "($1)"),
            );
        },
    };
};

// helpers ///////////////////////

function isCancelActivity(element: any): boolean {
    const businessObject = getBusinessObject(element);

    return businessObject && businessObject.cancelActivity !== false;
}

function getEventDefinition(element: any): any {
    const businessObject = getBusinessObject(element),
        eventDefinitions = businessObject.eventDefinitions;

    return eventDefinitions && eventDefinitions[0];
}

function getRawType(type: string): string {
    return type.split(":")[1];
}

function getEventDefinitionPrefix(eventDefinition: any): string {
    const rawType = getRawType(eventDefinition.$type);

    return rawType.replace("EventDefinition", "");
}

function isDefaultFlow(element: any): boolean {
    const businessObject = getBusinessObject(element);
    const sourceBusinessObject = getBusinessObject(element.source);

    if (!is(element, "bpmn:SequenceFlow") || !sourceBusinessObject) {
        return false;
    }

    return (
        sourceBusinessObject.default &&
        sourceBusinessObject.default === businessObject &&
        (is(sourceBusinessObject, "bpmn:Gateway") || is(sourceBusinessObject, "bpmn:Activity"))
    );
}

function isConditionalFlow(element: any): boolean {
    const businessObject = getBusinessObject(element);
    const sourceBusinessObject = getBusinessObject(element.source);

    if (!is(element, "bpmn:SequenceFlow") || !sourceBusinessObject) {
        return false;
    }

    return businessObject.conditionExpression && is(sourceBusinessObject, "bpmn:Activity");
}

function isPlane(element: any): boolean {
    // Backwards compatibility for bpmn-js<8
    const di = element && (element.di || getBusinessObject(element).di);

    return is(di, "bpmndi:BPMNPlane");
}
