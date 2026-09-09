/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `bpmnFactory`/`commandStack`, `disabled`
 * forwarded, guarded setters.
 */
import { getBusinessObject } from "bpmn-js/lib/util/ModelUtil";

import { sortBy } from "min-dash";

import {
    TextFieldEntry,
    isSelectEntryEdited,
    isTextFieldEntryEdited,
} from "@bpmn-io/properties-panel";

import ReferenceSelect from "../entries/ReferenceSelect";

import { useService } from "../../hooks/useService";

import { getError, getErrorEventDefinition, isErrorSupported } from "../utils/EventDefinitionUtil";

import {
    createElement,
    findRootElementById,
    findRootElementsByType,
    getRoot,
    nextId,
} from "../utils/ElementUtil";

const EMPTY_OPTION = "";
const CREATE_NEW_OPTION = "create-new";

export function ErrorProps(props: any): any[] {
    const { element } = props;

    if (!isErrorSupported(element)) {
        return [];
    }

    const error = getError(element);

    let entries: any[] = [
        {
            id: "errorRef",
            component: ErrorRef,
            isEdited: isSelectEntryEdited,
        },
    ];

    if (error) {
        entries = [
            ...entries,
            {
                id: "errorName",
                component: ErrorName,
                isEdited: isTextFieldEntryEdited,
            },
            {
                id: "errorCode",
                component: ErrorCode,
                isEdited: isTextFieldEntryEdited,
            },
        ];
    }

    return entries;
}

function ErrorRef(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const errorEventDefinition = getErrorEventDefinition(element);

    const getValue = () => {
        const error = getError(element);

        if (error) {
            return error.get("id");
        }

        return EMPTY_OPTION;
    };

    const setValue = (value: string) => {
        if (!commandStack) return;

        const root = getRoot(errorEventDefinition);
        const commands = [];

        let error;

        // (1) create new error
        if (value === CREATE_NEW_OPTION) {
            error = createElement("bpmn:Error", { name: nextId("Error_") }, root, bpmnFactory);

            value = error.get("id");

            commands.push({
                cmd: "element.updateModdleProperties",
                context: {
                    element,
                    moddleElement: root,
                    properties: {
                        rootElements: [...root.get("rootElements"), error],
                    },
                },
            });
        }

        // (2) update (or remove) errorRef
        error = error || findRootElementById(errorEventDefinition, "bpmn:Error", value);

        commands.push({
            cmd: "element.updateModdleProperties",
            context: {
                element,
                moddleElement: errorEventDefinition,
                properties: {
                    errorRef: error,
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

        const errors = findRootElementsByType(getBusinessObject(element), "bpmn:Error");

        sortByName(errors).forEach((error: any) => {
            options.push({
                value: error.get("id"),
                label: error.get("name"),
            });
        });

        return options;
    };

    return ReferenceSelect({
        element,
        id: "errorRef",
        label: translate("Global error reference"),
        autoFocusEntry: "errorName",
        getValue,
        setValue,
        getOptions,
        disabled,
    });
}

function ErrorName(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const error = getError(element);

    const getValue = () => {
        return error.get("name");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: error,
            properties: {
                name: value,
            },
        });
    };

    return TextFieldEntry({
        element,
        id: "errorName",
        label: translate("Name"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}

function ErrorCode(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const error = getError(element);

    const getValue = () => {
        return error.get("errorCode");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: error,
            properties: {
                errorCode: value,
            },
        });
    };

    return TextFieldEntry({
        element,
        id: "errorCode",
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
