/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `bpmnFactory`/`commandStack`, `disabled`
 * forwarded, guarded setters.
 */
import { getBusinessObject, is } from "bpmn-js/lib/util/ModelUtil";

import { TextFieldEntry, isTextFieldEntryEdited } from "@bpmn-io/properties-panel";

import { useService } from "../../hooks/useService";

import { createOrUpdateFormalExpression } from "../utils/FormalExpressionUtil";

export function MultiInstanceProps(props: any): any[] {
    const { element } = props;

    if (!isMultiInstanceSupported(element)) {
        return [];
    }

    return [
        {
            id: "loopCardinality",
            component: LoopCardinality,
            isEdited: isTextFieldEntryEdited,
        },
        {
            id: "completionCondition",
            component: CompletionCondition,
            isEdited: isTextFieldEntryEdited,
        },
    ];
}

function LoopCardinality(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const debounce = useService("debounceInput");
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const getValue = () => {
        return getLoopCardinalityValue(element);
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return createOrUpdateFormalExpression(
            element,
            getLoopCharacteristics(element),
            "loopCardinality",
            value,
            bpmnFactory,
            commandStack,
        );
    };

    return TextFieldEntry({
        element,
        id: "loopCardinality",
        label: translate("Loop cardinality"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}

function CompletionCondition(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const debounce = useService("debounceInput");
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const getValue = () => {
        return getCompletionConditionValue(element);
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return createOrUpdateFormalExpression(
            element,
            getLoopCharacteristics(element),
            "completionCondition",
            value,
            bpmnFactory,
            commandStack,
        );
    };

    return TextFieldEntry({
        element,
        id: "completionCondition",
        label: translate("Completion condition"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}

// helper ////////////////////////////

function isMultiInstanceSupported(element: any): boolean {
    const loopCharacteristics = getLoopCharacteristics(element);
    return (
        !!loopCharacteristics && is(loopCharacteristics, "bpmn:MultiInstanceLoopCharacteristics")
    );
}

function getBody(expression: any): string {
    return expression && expression.get("body");
}

function getProperty(element: any, propertyName: string): any {
    const loopCharacteristics = getLoopCharacteristics(element);
    return loopCharacteristics && loopCharacteristics.get(propertyName);
}

function getLoopCharacteristics(element: any): any {
    const bo = getBusinessObject(element);
    return bo.loopCharacteristics;
}

function getLoopCardinality(element: any): any {
    return getProperty(element, "loopCardinality");
}

function getLoopCardinalityValue(element: any): string {
    const loopCardinality = getLoopCardinality(element);
    return getBody(loopCardinality);
}

function getCompletionCondition(element: any): any {
    return getProperty(element, "completionCondition");
}

function getCompletionConditionValue(element: any): string {
    const completionCondition = getCompletionCondition(element);
    return getBody(completionCondition);
}
