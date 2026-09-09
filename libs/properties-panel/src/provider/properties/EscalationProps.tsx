/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `bpmnFactory`/`commandStack`, `disabled`
 * forwarded, guarded setters.
 */
import { getBusinessObject } from "bpmn-js/lib/util/ModelUtil";

import { sortBy } from "min-dash";

import {
    TextFieldEntry,
    isTextFieldEntryEdited,
    isSelectEntryEdited,
} from "@bpmn-io/properties-panel";
import ReferenceSelect from "../entries/ReferenceSelect";

import { useService } from "../../hooks/useService";

import {
    getEscalation,
    getEscalationEventDefinition,
    isEscalationSupported,
} from "../utils/EventDefinitionUtil";

import {
    createElement,
    findRootElementById,
    findRootElementsByType,
    getRoot,
    nextId,
} from "../utils/ElementUtil";

const CREATE_NEW_OPTION = "create-new";

export function EscalationProps(props: any): any[] {
    const { element } = props;

    if (!isEscalationSupported(element)) {
        return [];
    }

    const escalation = getEscalation(element);

    let entries: any[] = [
        {
            id: "escalationRef",
            component: EscalationRef,
            isEdited: isSelectEntryEdited,
        },
    ];

    if (escalation) {
        entries = [
            ...entries,
            {
                id: "escalationName",
                component: EscalationName,
                isEdited: isTextFieldEntryEdited,
            },
            {
                id: "escalationCode",
                component: EscalationCode,
                isEdited: isTextFieldEntryEdited,
            },
        ];
    }

    return entries;
}

function EscalationRef(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const escalationEventDefinition = getEscalationEventDefinition(element);

    const getValue = () => {
        const escalation = getEscalation(element);

        return escalation && escalation.get("id");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;

        const root = getRoot(escalationEventDefinition);
        const commands = [];

        let escalation;

        // (1) create new escalation
        if (value === CREATE_NEW_OPTION) {
            const id = nextId("Escalation_");

            escalation = createElement("bpmn:Escalation", { id, name: id }, root, bpmnFactory);

            value = escalation.get("id");

            commands.push({
                cmd: "element.updateModdleProperties",
                context: {
                    element,
                    moddleElement: root,
                    properties: {
                        rootElements: [...root.get("rootElements"), escalation],
                    },
                },
            });
        }

        // (2) update (or remove) escalationRef
        escalation =
            escalation || findRootElementById(escalationEventDefinition, "bpmn:Escalation", value);

        commands.push({
            cmd: "element.updateModdleProperties",
            context: {
                element,
                moddleElement: escalationEventDefinition,
                properties: {
                    escalationRef: escalation,
                },
            },
        });

        // (3) commit all updates
        return commandStack.execute("properties-panel.multi-command-executor", commands);
    };

    const getOptions = () => {
        const options = [
            { value: "", label: translate("<none>") },
            { value: CREATE_NEW_OPTION, label: translate("Create new ...") },
        ];

        const escalations = findRootElementsByType(getBusinessObject(element), "bpmn:Escalation");

        sortByName(escalations).forEach((escalation: any) => {
            options.push({
                value: escalation.get("id"),
                label: escalation.get("name"),
            });
        });

        return options;
    };

    return ReferenceSelect({
        element,
        id: "escalationRef",
        label: translate("Global escalation reference"),
        autoFocusEntry: "escalationName",
        getValue,
        setValue,
        getOptions,
        disabled,
    });
}

function EscalationName(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const escalation = getEscalation(element);

    const getValue = () => {
        return escalation.get("name");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: escalation,
            properties: {
                name: value,
            },
        });
    };

    return TextFieldEntry({
        element,
        id: "escalationName",
        label: translate("Name"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}

function EscalationCode(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const escalation = getEscalation(element);

    const getValue = () => {
        return escalation.get("escalationCode");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: escalation,
            properties: {
                escalationCode: value,
            },
        });
    };

    return TextFieldEntry({
        element,
        id: "escalationCode",
        label: translate("Code"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}

// helper /////////////////////////

function sortByName(elements: any[]): any[] {
    return sortBy(elements, (e: any) => (e.name || "").toLowerCase());
}
