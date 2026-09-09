/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `modeling`, `disabled` forwarded, guarded setter.
 */
import { getBusinessObject, is } from "bpmn-js/lib/util/ModelUtil";

import { TextFieldEntry, isTextFieldEntryEdited } from "@bpmn-io/properties-panel";

import { useCallback } from "@bpmn-io/properties-panel/preact/hooks";

import { useService } from "../../hooks/useService";

import { isIdValid } from "../utils/ValidationUtil";

export function IdProps(): any[] {
    return [
        {
            id: "id",
            component: Id,
            isEdited: isTextFieldEntryEdited,
        },
    ];
}

function Id(props: any) {
    const { element, disabled } = props;

    const modeling = useService("modeling", false);
    const debounce = useService("debounceInput");
    const translate = useService("translate");

    const setValue = (value: string, error?: unknown) => {
        if (error || !modeling) {
            return;
        }

        modeling.updateProperties(element, {
            id: value,
        });
    };

    const getValue = useCallback(
        (element: any) => {
            return getBusinessObject(element).id;
        },
        [element],
    );

    const validate = useCallback(
        (value: string) => {
            const businessObject = getBusinessObject(element);

            return isIdValid(businessObject, value, translate);
        },
        [element, translate],
    );

    return TextFieldEntry({
        element,
        id: "id",
        label: translate(is(element, "bpmn:Participant") ? "Participant ID" : "ID"),
        getValue,
        setValue,
        debounce,
        disabled,
        validate,
    });
}
