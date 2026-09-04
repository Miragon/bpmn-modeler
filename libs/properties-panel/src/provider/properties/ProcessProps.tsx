/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `commandStack`, `disabled` forwarded, guarded setters.
 */
import { is } from "bpmn-js/lib/util/ModelUtil";

import { TextFieldEntry, isTextFieldEntryEdited } from "@bpmn-io/properties-panel";

import { useCallback } from "@bpmn-io/properties-panel/preact/hooks";

import { useService } from "../../hooks/useService";

import { isIdValid } from "../utils/ValidationUtil";

export function ProcessProps(props: any): any[] {
    const { element } = props;

    if (!hasProcessRef(element)) {
        return [];
    }

    return [
        {
            id: "processId",
            component: ProcessId,
            isEdited: isTextFieldEntryEdited,
        },
        {
            id: "processName",
            component: ProcessName,
            isEdited: isTextFieldEntryEdited,
        },
    ];
}

function ProcessName(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");
    const process = element.businessObject.get("processRef");

    const getValue = () => {
        return process.get("name");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: process,
            properties: {
                name: value,
            },
        });
    };

    return TextFieldEntry({
        element,
        id: "processName",
        label: translate("Process name"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}

function ProcessId(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");
    const process = element.businessObject.get("processRef");

    const getValue = () => {
        return process.get("id");
    };

    const setValue = (value: string, error?: unknown) => {
        if (error || !commandStack) {
            return;
        }

        commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: process,
            properties: {
                id: value,
            },
        });
    };

    const validate = useCallback(
        (value: string) => {
            return isIdValid(process, value, translate);
        },
        [process, translate],
    );

    return TextFieldEntry({
        element,
        id: "processId",
        label: translate("Process ID"),
        getValue,
        setValue,
        debounce,
        disabled,
        validate,
    });
}

// helper ////////////////

function hasProcessRef(element: any): boolean {
    return is(element, "bpmn:Participant") && element.businessObject.get("processRef");
}
