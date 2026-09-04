/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `modeling`/`commandStack`, `disabled` forwarded,
 * guarded setter.
 */
import { is } from "bpmn-js/lib/util/ModelUtil";

import { CheckboxEntry, isCheckboxEntryEdited } from "@bpmn-io/properties-panel";

import { useService } from "../../hooks/useService";

export function ExecutableProps(props: any): any[] {
    const { element } = props;

    if (!is(element, "bpmn:Process") && !hasProcessRef(element)) {
        return [];
    }

    return [
        {
            id: "isExecutable",
            component: Executable,
            isEdited: isCheckboxEntryEdited,
        },
    ];
}

function Executable(props: any) {
    const { element, disabled } = props;

    const modeling = useService("modeling", false);
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    let getValue: any, setValue: any;

    setValue = (value: boolean) => {
        if (!modeling) return;
        modeling.updateProperties(element, {
            isExecutable: value,
        });
    };

    getValue = (element: any) => {
        return element.businessObject.isExecutable;
    };

    // handle properties on processRef level for participants
    if (is(element, "bpmn:Participant")) {
        const process = element.businessObject.get("processRef");

        setValue = (value: boolean) => {
            if (!commandStack) return;
            commandStack.execute("element.updateModdleProperties", {
                element,
                moddleElement: process,
                properties: {
                    isExecutable: value,
                },
            });
        };

        getValue = () => {
            return process.get("isExecutable");
        };
    }

    return CheckboxEntry({
        element,
        id: "isExecutable",
        label: translate("Executable"),
        getValue,
        setValue,
        disabled,
    });
}

// helper /////////////////////

function hasProcessRef(element: any): boolean {
    return is(element, "bpmn:Participant") && element.businessObject.get("processRef");
}
