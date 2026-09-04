/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim: event-definition support predicates + accessors used by the neutral
 * error/message/signal/link/escalation/timer/compensation entries.
 */
import { isAny } from "bpmn-js/lib/features/modeling/util/ModelingUtil";

import { getBusinessObject, is } from "bpmn-js/lib/util/ModelUtil";

import { find } from "min-dash";

export function isErrorSupported(element: any): boolean {
    return (
        isAny(element, ["bpmn:StartEvent", "bpmn:BoundaryEvent", "bpmn:EndEvent"]) &&
        !!getErrorEventDefinition(element)
    );
}

export function getErrorEventDefinition(element: any): any {
    return getEventDefinition(element, "bpmn:ErrorEventDefinition");
}

export function isTimerSupported(element: any): boolean {
    return (
        isAny(element, ["bpmn:StartEvent", "bpmn:IntermediateCatchEvent", "bpmn:BoundaryEvent"]) &&
        !!getTimerEventDefinition(element)
    );
}

export function getTimerDefinitionType(timer: any): string | undefined {
    if (!timer) {
        return;
    }

    const timeDate = timer.get("timeDate");
    if (typeof timeDate !== "undefined") {
        return "timeDate";
    }

    const timeCycle = timer.get("timeCycle");
    if (typeof timeCycle !== "undefined") {
        return "timeCycle";
    }

    const timeDuration = timer.get("timeDuration");
    if (typeof timeDuration !== "undefined") {
        return "timeDuration";
    }

    return undefined;
}

export function getTimerEventDefinition(element: any): any {
    return getEventDefinition(element, "bpmn:TimerEventDefinition");
}

export function getError(element: any): any {
    const errorEventDefinition = getErrorEventDefinition(element);

    return errorEventDefinition && errorEventDefinition.get("errorRef");
}

function getEventDefinition(element: any, eventType: string): any {
    const businessObject = getBusinessObject(element);

    const eventDefinitions = businessObject.get("eventDefinitions") || [];

    return find(eventDefinitions, function (definition: any) {
        return is(definition, eventType);
    });
}

export function isMessageSupported(element: any): boolean {
    return (
        is(element, "bpmn:ReceiveTask") ||
        (isAny(element, [
            "bpmn:StartEvent",
            "bpmn:EndEvent",
            "bpmn:IntermediateThrowEvent",
            "bpmn:BoundaryEvent",
            "bpmn:IntermediateCatchEvent",
        ]) &&
            !!getMessageEventDefinition(element))
    );
}

export function getMessageEventDefinition(element: any): any {
    if (is(element, "bpmn:ReceiveTask")) {
        return getBusinessObject(element);
    }

    return getEventDefinition(element, "bpmn:MessageEventDefinition");
}

export function getMessage(element: any): any {
    const messageEventDefinition = getMessageEventDefinition(element);

    return messageEventDefinition && messageEventDefinition.get("messageRef");
}

export function getLinkEventDefinition(element: any): any {
    return getEventDefinition(element, "bpmn:LinkEventDefinition");
}

export function getSignalEventDefinition(element: any): any {
    return getEventDefinition(element, "bpmn:SignalEventDefinition");
}

export function isLinkSupported(element: any): boolean {
    return (
        isAny(element, ["bpmn:IntermediateThrowEvent", "bpmn:IntermediateCatchEvent"]) &&
        !!getLinkEventDefinition(element)
    );
}

export function isSignalSupported(element: any): boolean {
    return is(element, "bpmn:Event") && !!getSignalEventDefinition(element);
}

export function getSignal(element: any): any {
    const signalEventDefinition = getSignalEventDefinition(element);

    return signalEventDefinition && signalEventDefinition.get("signalRef");
}

export function getEscalationEventDefinition(element: any): any {
    return getEventDefinition(element, "bpmn:EscalationEventDefinition");
}

export function isEscalationSupported(element: any): boolean {
    return is(element, "bpmn:Event") && !!getEscalationEventDefinition(element);
}

export function getEscalation(element: any): any {
    const escalationEventDefinition = getEscalationEventDefinition(element);

    return escalationEventDefinition && escalationEventDefinition.get("escalationRef");
}

export function isCompensationSupported(element: any): boolean {
    return (
        isAny(element, ["bpmn:EndEvent", "bpmn:IntermediateThrowEvent"]) &&
        !!getCompensateEventDefinition(element)
    );
}

export function getCompensateEventDefinition(element: any): any {
    return getEventDefinition(element, "bpmn:CompensateEventDefinition");
}

export function getCompensateActivity(element: any): any {
    const compensateEventDefinition = getCompensateEventDefinition(element);

    return compensateEventDefinition && compensateEventDefinition.get("activityRef");
}
