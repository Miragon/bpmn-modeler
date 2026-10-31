import type { EngineCatalog } from "./types";

/** Camunda 7 bindings the builder edits, the default for a new property first; `catalog.coverage.spec.ts` lists the rest. */
export const C7_CATALOG: EngineCatalog = {
    engine: "c7",
    propertyTypes: ["String", "Text", "Hidden", "Dropdown", "Boolean"],
    propertyExtras: false,
    elementTypes: [
        "bpmn:ServiceTask",
        "bpmn:SendTask",
        "bpmn:UserTask",
        "bpmn:ScriptTask",
        "bpmn:BusinessRuleTask",
        "bpmn:CallActivity",
        "bpmn:Task",
        "bpmn:StartEvent",
        "bpmn:IntermediateThrowEvent",
        "bpmn:IntermediateCatchEvent",
        "bpmn:EndEvent",
        "bpmn:BoundaryEvent",
        "bpmn:SubProcess",
        "bpmn:Process",
        "bpmn:SequenceFlow",
    ],
    bindings: [
        {
            type: "camunda:inputParameter",
            label: "Input parameter",
            fields: [
                { key: "name", label: "Name", kind: "text", required: true, initial: "input" },
                { key: "scriptFormat", label: "Script format", kind: "text" },
            ],
            types: ["String", "Text", "Hidden", "Dropdown"],
        },
        {
            type: "property",
            label: "BPMN attribute",
            fields: [
                { key: "name", label: "Attribute", kind: "text", required: true, initial: "name" },
            ],
            types: ["String", "Text", "Hidden", "Dropdown", "Boolean"],
        },
        {
            type: "camunda:property",
            label: "Extension property",
            fields: [
                { key: "name", label: "Name", kind: "text", required: true, initial: "property" },
            ],
            types: ["String", "Hidden", "Dropdown"],
        },
        {
            type: "camunda:outputParameter",
            label: "Output parameter",
            fields: [
                {
                    key: "source",
                    label: "Source",
                    kind: "text",
                    required: true,
                    initial: "${output}",
                },
                { key: "scriptFormat", label: "Script format", kind: "text" },
            ],
            types: ["String", "Hidden", "Dropdown"],
        },
        {
            type: "camunda:field",
            label: "Field injection",
            fields: [
                { key: "name", label: "Name", kind: "text", required: true, initial: "field" },
                { key: "expression", label: "Value is an expression", kind: "flag" },
            ],
            types: ["String", "Text", "Hidden", "Dropdown"],
        },
    ],
};
