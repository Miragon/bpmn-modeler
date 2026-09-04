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

import {
    getSignal,
    getSignalEventDefinition,
    isSignalSupported,
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

export function SignalProps(props: any): any[] {
    const { element } = props;

    if (!isSignalSupported(element)) {
        return [];
    }

    const signal = getSignal(element);

    let entries: any[] = [
        {
            id: "signalRef",
            component: SignalRef,
            isEdited: isSelectEntryEdited,
        },
    ];

    if (signal) {
        entries = [
            ...entries,
            {
                id: "signalName",
                component: SignalName,
                isEdited: isTextFieldEntryEdited,
            },
        ];
    }

    return entries;
}

function SignalRef(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");

    const signalEventDefinition = getSignalEventDefinition(element);

    const getValue = () => {
        const signal = getSignal(element);

        if (signal) {
            return signal.get("id");
        }

        return EMPTY_OPTION;
    };

    const setValue = (value: string) => {
        if (!commandStack) return;

        const root = getRoot(signalEventDefinition);
        const commands = [];

        let signal;

        // (1) create new signal
        if (value === CREATE_NEW_OPTION) {
            const id = nextId("Signal_");

            signal = createElement("bpmn:Signal", { id, name: id }, root, bpmnFactory);

            value = signal.get("id");

            commands.push({
                cmd: "element.updateModdleProperties",
                context: {
                    element,
                    moddleElement: root,
                    properties: {
                        rootElements: [...root.get("rootElements"), signal],
                    },
                },
            });
        }

        // (2) update (or remove) signalRef
        signal = signal || findRootElementById(signalEventDefinition, "bpmn:Signal", value);

        commands.push({
            cmd: "element.updateModdleProperties",
            context: {
                element,
                moddleElement: signalEventDefinition,
                properties: {
                    signalRef: signal,
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

        const signals = findRootElementsByType(getBusinessObject(element), "bpmn:Signal");

        sortByName(signals).forEach((signal: any) => {
            options.push({
                value: signal.get("id"),
                label: signal.get("name"),
            });
        });

        return options;
    };

    return ReferenceSelect({
        element,
        id: "signalRef",
        label: translate("Global signal reference"),
        autoFocusEntry: "signalName",
        getValue,
        setValue,
        getOptions,
        disabled,
    });
}

function SignalName(props: any) {
    const { element, disabled } = props;

    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const signal = getSignal(element);

    const getValue = () => {
        return signal.get("name");
    };

    const setValue = (value: string) => {
        if (!commandStack) return;
        return commandStack.execute("element.updateModdleProperties", {
            element,
            moddleElement: signal,
            properties: {
                name: value,
            },
        });
    };

    return TextFieldEntry({
        element,
        id: "signalName",
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
