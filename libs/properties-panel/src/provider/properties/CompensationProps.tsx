/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `commandStack`, `disabled` forwarded, guarded setters.
 */
import { find, sortBy } from "min-dash";

import { getBusinessObject, is } from "bpmn-js/lib/util/ModelUtil";

import {
    isSelectEntryEdited,
    isCheckboxEntryEdited,
    CheckboxEntry,
} from "@bpmn-io/properties-panel";

import { useService } from "../../hooks/useService";

import ReferenceSelect from "../entries/ReferenceSelect";

import {
    getCompensateActivity,
    getCompensateEventDefinition,
    isCompensationSupported,
} from "../utils/EventDefinitionUtil";

export function CompensationProps(props: any): any[] {
    const { element } = props;

    if (!isCompensationSupported(element)) {
        return [];
    }

    return [
        {
            id: "waitForCompletion",
            component: WaitForCompletion,
            isEdited: isCheckboxEntryEdited,
        },
        {
            id: "activityRef",
            component: ActivityRef,
            isEdited: isSelectEntryEdited,
        },
    ];
}

function WaitForCompletion(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const compensateEventDefinition = getCompensateEventDefinition(element);

    const getValue = () => {
        return compensateEventDefinition.get("waitForCompletion");
    };

    const setValue = (value: boolean) => {
        if (!commandStack) return;
        commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: compensateEventDefinition,
            properties: {
                waitForCompletion: value,
            },
        });
    };

    return CheckboxEntry({
        element,
        id: "waitForCompletion",
        label: translate("Wait for completion"),
        getValue,
        setValue,
        disabled,
    });
}

function ActivityRef(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const elementRegistry = useService("elementRegistry");
    const translate = useService("translate");

    const compensateEventDefinition = getCompensateEventDefinition(element);

    const getValue = () => {
        const activityRef = getCompensateActivity(element);

        return activityRef && activityRef.get("id");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;

        // update (or remove) activityRef
        const activityRef = value ? getBusinessObject(elementRegistry.get(value)) : undefined;

        commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: compensateEventDefinition,
            properties: {
                activityRef,
            },
        });
    };

    const getOptions = () => {
        const options = [{ value: "", label: translate("<none>") }];

        const activities = findActivityRefs(element);

        sortByName(activities).forEach(function (activity: any) {
            options.push({
                value: activity.id,
                label: createOptionLabel(activity),
            });
        });

        return options;
    };

    return ReferenceSelect({
        element,
        id: "activityRef",
        label: translate("Activity reference"),
        getValue,
        setValue,
        getOptions,
        disabled,
    });
}

// helper /////////////////////////

function getFlowElements(element: any, type: string): any[] {
    const { flowElements } = element;
    return flowElements.filter(function (flowElement: any) {
        return is(flowElement, type);
    });
}

function getContainedActivities(element: any): any[] {
    return getFlowElements(element, "bpmn:Activity");
}

function getContainedBoundaryEvents(element: any): any[] {
    return getFlowElements(element, "bpmn:BoundaryEvent");
}

function hasCompensationEventAttached(activity: any, boundaryEvents: any[]): boolean {
    const { id: activityId } = activity;

    return !!find(boundaryEvents, function (boundaryEvent: any) {
        const { attachedToRef } = boundaryEvent;
        const compensateEventDefinition = getCompensateEventDefinition(boundaryEvent);

        return attachedToRef && compensateEventDefinition && attachedToRef.id === activityId;
    });
}

function canBeCompensated(activity: any, boundaryEvents: any[]): boolean {
    return (
        is(activity, "bpmn:CallActivity") ||
        (is(activity, "bpmn:SubProcess") &&
            !activity.triggeredByEvent &&
            !activity.isForCompensation) ||
        hasCompensationEventAttached(activity, boundaryEvents)
    );
}

function getActivitiesForCompensation(element: any): any[] {
    const activities = getContainedActivities(element);
    const boundaryEvents = getContainedBoundaryEvents(element);

    return activities.filter(function (activity: any) {
        return canBeCompensated(activity, boundaryEvents);
    });
}

function findActivityRefs(element: any): any[] {
    const businessObject = getBusinessObject(element);

    let parent = businessObject.$parent;

    // (1) get all activities in parent container
    let activities = getActivitiesForCompensation(parent);

    // (2) if throwing compensation event is inside an EventSubProcess,
    // also get all activities outside of the event sub process
    if (is(parent, "bpmn:SubProcess") && parent.triggeredByEvent) {
        parent = parent.$parent;
        if (parent) {
            activities = [...activities, ...getActivitiesForCompensation(parent)];
        }
    }

    return activities;
}

function createOptionLabel(activity: any): string {
    const { id, name } = activity;

    return `${name ? name + " " : ""}(id=${id})`;
}

function sortByName(elements: any[]): any[] {
    return sortBy(elements, (e: any) => (e.name || "").toLowerCase());
}
