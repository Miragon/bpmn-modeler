/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode deltas: optional `bpmnFactory`/`commandStack`, `disabled`
 * forwarded, guarded setter.
 */
import { getBusinessObject, is } from "bpmn-js/lib/util/ModelUtil";

import { TextAreaEntry, isTextAreaEntryEdited } from "@bpmn-io/properties-panel";

import { useService } from "../../hooks/useService";

import { without } from "min-dash";

const DOCUMENTATION_TEXT_FORMAT = "text/plain";

export function DocumentationProps(props: any): any[] {
    const { element } = props;

    const entries = [
        {
            id: "documentation",
            component: ElementDocumentationProperty,
            isEdited: isTextAreaEntryEdited,
        },
    ];

    if (hasProcessRef(element)) {
        entries.push({
            id: "processDocumentation",
            component: ProcessDocumentationProperty,
            isEdited: isTextAreaEntryEdited,
        });
    }

    return entries;
}

function ElementDocumentationProperty(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const getValue = getDocumentation(getBusinessObject(element));

    const setValue = setDocumentation(
        element,
        getBusinessObject(element),
        bpmnFactory,
        commandStack,
    );

    return TextAreaEntry({
        element,
        id: "documentation",
        label: translate("Element documentation"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}

function ProcessDocumentationProperty(props: any) {
    const { element, disabled } = props;

    const bpmnFactory = useService("bpmnFactory", false);
    const commandStack = useService("commandStack", false);
    const translate = useService("translate");
    const debounce = useService("debounceInput");

    const processRef = getBusinessObject(element).processRef;

    const getValue = getDocumentation(processRef);

    const setValue = setDocumentation(element, processRef, bpmnFactory, commandStack);

    return TextAreaEntry({
        element,
        id: "processDocumentation",
        label: translate("Process documentation"),
        getValue,
        setValue,
        debounce,
        disabled,
    });
}

// helper ////////////////////////////

function hasProcessRef(element: any): boolean {
    return is(element, "bpmn:Participant") && element.businessObject.get("processRef");
}

function findDocumentation(docs: any): any {
    return docs.find(function (d: any) {
        return (d.textFormat || DOCUMENTATION_TEXT_FORMAT) === DOCUMENTATION_TEXT_FORMAT;
    });
}

function getDocumentation(businessObject: any) {
    return function () {
        const documentation = findDocumentation(
            businessObject && businessObject.get("documentation"),
        );

        return documentation && documentation.text;
    };
}

function setDocumentation(element: any, businessObject: any, bpmnFactory: any, commandStack: any) {
    return function (value: string) {
        if (!commandStack) return;

        let documentation = findDocumentation(
            businessObject && businessObject.get("documentation"),
        );

        // (1) update or removing existing documentation
        if (documentation) {
            if (value) {
                return commandStack.execute("element.updateModdleProperties", {
                    element,
                    moddleElement: documentation,
                    properties: {
                        text: value,
                    },
                });
            } else {
                return commandStack.execute("element.updateModdleProperties", {
                    element,
                    moddleElement: businessObject,
                    properties: {
                        documentation: without(businessObject.get("documentation"), documentation),
                    },
                });
            }
        }

        // (2) create new documentation entry
        if (value) {
            documentation = bpmnFactory.create("bpmn:Documentation", {
                text: value,
            });

            return commandStack.execute("element.updateModdleProperties", {
                element,
                moddleElement: businessObject,
                properties: {
                    documentation: [...businessObject.get("documentation"), documentation],
                },
            });
        }
    };
}
