import { type BindingField, type EngineCatalog, TEXTUAL_PROPERTY_TYPES } from "./types";

const ELEMENT_TYPES: readonly string[] = [
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
];

// A process and a sequence flow have no input or output of their own.
const FLOW_NODES = ELEMENT_TYPES.filter(
    (type) => type !== "bpmn:Process" && type !== "bpmn:SequenceFlow",
);
const CALL_ACTIVITY: readonly string[] = ["bpmn:CallActivity"];
// camunda:ServiceTaskLike: what can run a Java delegate, whose fields get injected.
const SERVICE_TASK_LIKE: readonly string[] = [
    "bpmn:ServiceTask",
    "bpmn:SendTask",
    "bpmn:BusinessRuleTask",
    "bpmn:IntermediateThrowEvent",
    "bpmn:EndEvent",
];
const VARIABLES: BindingField = {
    key: "variables",
    label: "Variables",
    kind: "choice",
    options: ["", "all", "local"],
};

/** Camunda 7 bindings the builder edits, the default for a new property first. */
export const C7_CATALOG: EngineCatalog = {
    engine: "c7",
    propertyTypes: ["String", "Text", "Hidden", "Dropdown", "Boolean"],
    propertyExtras: false,
    elementTypes: ELEMENT_TYPES,
    jsonOnlyBindings: ["camunda:executionListener", "camunda:errorEventDefinition"],
    bindings: [
        {
            type: "camunda:inputParameter",
            label: "Input Parameter",
            fields: [
                { key: "name", label: "Name", kind: "text", required: true, initial: "input" },
                { key: "scriptFormat", label: "Script Format", kind: "text" },
            ],
            types: TEXTUAL_PROPERTY_TYPES,
            elements: FLOW_NODES,
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
            label: "Output Parameter",
            fields: [
                {
                    key: "source",
                    label: "Source",
                    kind: "text",
                    required: true,
                    initial: "${output}",
                },
                { key: "scriptFormat", label: "Script Format", kind: "text" },
            ],
            types: ["String", "Hidden", "Dropdown"],
            elements: FLOW_NODES,
        },
        {
            type: "camunda:in",
            label: "In mapping",
            fields: [
                { key: "target", label: "Target", kind: "text", required: true, initial: "input" },
                {
                    key: "expression",
                    label: "Expression",
                    description: "The value is an expression.",
                    kind: "flag",
                },
                VARIABLES,
            ],
            types: ["String", "Hidden", "Dropdown"],
            elements: CALL_ACTIVITY,
        },
        {
            type: "camunda:out",
            label: "Out Mapping",
            fields: [
                { key: "source", label: "Source", kind: "text", required: true, initial: "output" },
                { key: "sourceExpression", label: "Source expression", kind: "text" },
                VARIABLES,
            ],
            types: ["String", "Hidden", "Dropdown"],
            elements: CALL_ACTIVITY,
        },
        {
            type: "camunda:in:businessKey",
            label: "Business key",
            fields: [],
            types: ["String", "Hidden", "Dropdown"],
            elements: CALL_ACTIVITY,
        },
        {
            type: "camunda:field",
            label: "Field injection",
            fields: [
                { key: "name", label: "Name", kind: "text", required: true, initial: "field" },
                {
                    key: "expression",
                    label: "Expression",
                    description: "The value is an expression.",
                    kind: "flag",
                },
            ],
            types: TEXTUAL_PROPERTY_TYPES,
            elements: SERVICE_TASK_LIKE,
        },
    ],
};
