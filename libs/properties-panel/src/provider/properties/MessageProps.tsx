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
    getMessage,
    getMessageEventDefinition,
    isMessageSupported,
} from "../utils/EventDefinitionUtil";

import {
    createElement,
    findRootElementById,
    findRootElementsByType,
    getRoot,
    nextId,
} from "../utils/ElementUtil";

const EMPTY_OPTION = "";
const CREATE_NEW_OPTION = "create-new";

export function MessageProps(props: any): any[] {
    const { element } = props;

    if (!isMessageSupported(element)) {
        return [];
    }

    const message = getMessage(element);

    let entries: any[] = [
        {
            id: "messageRef",
            component: MessageRef,
            isEdited: isSelectEntryEdited,
        },
    ];

    if (message) {
        entries = [
            ...entries,
            {
                id: "messageName",
                component: MessageName,
                isEdited: isTextFieldEntryEdited,
            },
        ];
    }

    return entries;
}

function MessageRef(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const messageEventDefinition = getMessageEventDefinition(element);

    const getValue = () => {
        const message = getMessage(element);

        if (message) {
            return message.get("id");
        }

        return EMPTY_OPTION;
    };

    const setValue = (value: string) => {
        if (!commandStack) return;

        const root = getRoot(messageEventDefinition);
        const commands = [];

        let message;

        // (1) create new message
        if (value === CREATE_NEW_OPTION) {
            const id = nextId("Message_");

            message = createElement("bpmn:Message", { id, name: id }, root, bpmnFactory);

            value = message.get("id");

            commands.push({
                cmd: "element.updateModdleProperties",
                context: {
                    element,
                    moddleElement: root,
                    properties: {
                        rootElements: [...root.get("rootElements"), message],
                    },
                },
            });
        }

        // (2) update (or remove) messageRef
        message = message || findRootElementById(messageEventDefinition, "bpmn:Message", value);

        commands.push({
            cmd: "element.updateModdleProperties",
            context: {
                element,
                moddleElement: messageEventDefinition,
                properties: {
                    messageRef: message,
                },
            },
        });

        // (3) commit all updates
        return commandStack.execute("properties-panel.multi-command-executor", commands);
    };

    const getOptions = () => {
        const options = [
            { value: EMPTY_OPTION, label: translate("<none>") },
            { value: CREATE_NEW_OPTION, label: translate("Create new ...") },
        ];

        const messages = findRootElementsByType(getBusinessObject(element), "bpmn:Message");

        sortByName(messages).forEach((message: any) => {
            options.push({
                value: message.get("id"),
                label: message.get("name"),
            });
        });

        return options;
    };

    return ReferenceSelect({
        element,
        id: "messageRef",
        label: translate("Global message reference"),
        autoFocusEntry: "messageName",
        getValue,
        setValue,
        getOptions,
        disabled,
    });
}

function MessageName(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const message = getMessage(element);

    const getValue = () => {
        return message.get("name");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: message,
            properties: {
                name: value,
            },
        });
    };

    return TextFieldEntry({
        element,
        id: "messageName",
        label: translate("Name"),
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
