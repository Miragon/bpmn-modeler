/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `commandStack`, `disabled` forwarded, guarded setter.
 */
import { TextFieldEntry, isTextFieldEntryEdited } from "@bpmn-io/properties-panel";

import { useService } from "../../hooks/useService";

import { getLinkEventDefinition, isLinkSupported } from "../utils/EventDefinitionUtil";

export function LinkProps(props: any): any[] {
    const { element } = props;

    if (!isLinkSupported(element)) {
        return [];
    }

    return [
        {
            id: "linkName",
            component: LinkName,
            isEdited: isTextFieldEntryEdited,
        },
    ];
}

function LinkName(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const linkEventDefinition = getLinkEventDefinition(element);

    const getValue = () => {
        return linkEventDefinition.get("name");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: linkEventDefinition,
            properties: {
                name: value,
            },
        });
    };

    return TextFieldEntry({
        element,
        id: "linkName",
        label: translate("Name"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}
