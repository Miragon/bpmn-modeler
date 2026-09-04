/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `bpmnFactory`/`commandStack`, `disabled`
 * forwarded, guarded setters.
 */
import { is, getBusinessObject } from "bpmn-js/lib/util/ModelUtil";

import { CheckboxEntry, isTextFieldEntryEdited, TextFieldEntry } from "@bpmn-io/properties-panel";

import { useService } from "../../hooks/useService";
import { createOrUpdateFormalExpression } from "../utils/FormalExpressionUtil";

export function AdHocCompletionProps(props: any): any[] {
    const { element } = props;

    if (!is(element, "bpmn:AdHocSubProcess")) {
        return [];
    }

    return [
        {
            id: "completionCondition",
            component: CompletionCondition,
            isEdited: isTextFieldEntryEdited,
        },
        {
            id: "cancelRemainingInstances",
            component: CancelRemainingInstances,
            isEdited: (node: any) => node && !node.checked, // the default value is true
        },
    ];
}

function CompletionCondition(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const debounce = useService("debounceInput");
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const getValue = () => {
        const expression = getBusinessObject(element).get("completionCondition");
        return expression && expression.get("body");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return createOrUpdateFormalExpression(
            element,
            getBusinessObject(element),
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

function CancelRemainingInstances(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const businessObject = getBusinessObject(element);

    const getValue = () => {
        return businessObject.get("cancelRemainingInstances");
    };

    const setValue = (value: boolean) => {
        if (!commandStack) return;
        commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: businessObject,
            properties: {
                cancelRemainingInstances: value,
            },
        });
    };

    return CheckboxEntry({
        element,
        id: "cancelRemainingInstances",
        label: translate("Cancel remaining instances"),
        getValue,
        setValue,
        disabled,
    });
}
