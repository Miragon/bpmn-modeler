import type { ElementTypeChoice, EngineCatalog, PropertyType, Requirement } from "./types";

const ALL: readonly PropertyType[] = ["String", "Text", "Hidden", "Dropdown", "Boolean", "Number"];
const TEXTUAL: readonly PropertyType[] = ["String", "Text", "Hidden", "Dropdown"];

const MESSAGE = "bpmn:MessageEventDefinition";
const MESSAGE_ELEMENTS: readonly ElementTypeChoice[] = [
    { value: "bpmn:ReceiveTask" },
    { value: "bpmn:SendTask" },
    { value: "bpmn:IntermediateCatchEvent", eventDefinition: MESSAGE },
    { value: "bpmn:IntermediateThrowEvent", eventDefinition: MESSAGE },
    { value: "bpmn:StartEvent", eventDefinition: MESSAGE },
    { value: "bpmn:EndEvent", eventDefinition: MESSAGE },
    { value: "bpmn:BoundaryEvent", eventDefinition: MESSAGE },
];
const SUBSCRIPTION_ELEMENTS: readonly ElementTypeChoice[] = MESSAGE_ELEMENTS.filter(
    ({ value }) => value !== "bpmn:SendTask",
);

const USER_TASK: Requirement = { kind: "elementType", oneOf: [{ value: "bpmn:UserTask" }] };
const USER_TASK_BINDING: Requirement = {
    kind: "binding",
    binding: { type: "zeebe:userTask" },
    label: "a zeebe:userTask property",
};

/** Camunda 8 bindings the builder edits; `catalog.coverage.spec.ts` lists the rest. */
export const C8_CATALOG: EngineCatalog = {
    engine: "c8",
    propertyTypes: ALL,
    propertyExtras: true,
    elementTypes: [
        "bpmn:ServiceTask",
        "bpmn:UserTask",
        "bpmn:SendTask",
        "bpmn:ReceiveTask",
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
            type: "zeebe:input",
            label: "Input mapping",
            fields: [
                { key: "name", label: "Target", kind: "text", required: true, initial: "input" },
            ],
            types: ALL,
            feel: "optional",
            optional: true,
        },
        {
            type: "zeebe:output",
            label: "Output mapping",
            fields: [
                {
                    key: "source",
                    label: "Source",
                    kind: "text",
                    required: true,
                    initial: "=result",
                },
            ],
            types: ALL,
            feel: "optional",
            optional: true,
        },
        {
            type: "zeebe:taskHeader",
            label: "Task header",
            fields: [{ key: "key", label: "Key", kind: "text", required: true, initial: "header" }],
            types: ALL,
            feel: "optional",
            optional: true,
        },
        {
            type: "zeebe:taskDefinition",
            label: "Task definition",
            fields: [
                {
                    key: "property",
                    label: "Attribute",
                    kind: "choice",
                    options: ["type", "retries"],
                    required: true,
                    initial: "type",
                },
            ],
            types: ALL,
            feel: "optional",
            variants: { field: "property", values: { retries: { sample: "3" } } },
        },
        {
            type: "zeebe:property",
            label: "Extension property",
            fields: [
                { key: "name", label: "Name", kind: "text", required: true, initial: "property" },
            ],
            types: ALL,
            feel: "optional",
            optional: true,
        },
        {
            type: "property",
            label: "BPMN attribute",
            fields: [
                { key: "name", label: "Attribute", kind: "text", required: true, initial: "name" },
            ],
            types: ALL,
            feel: "optional",
        },
        {
            type: "bpmn:Message#property",
            label: "Message",
            fields: [
                {
                    key: "name",
                    label: "Attribute",
                    kind: "choice",
                    options: ["name"],
                    required: true,
                    initial: "name",
                },
            ],
            types: ALL,
            feel: "optional",
            requires: [{ kind: "elementType", oneOf: MESSAGE_ELEMENTS }],
        },
        {
            type: "bpmn:Message#zeebe:subscription#property",
            label: "Message subscription",
            fields: [
                {
                    key: "name",
                    label: "Attribute",
                    kind: "choice",
                    options: ["correlationKey"],
                    required: true,
                    initial: "correlationKey",
                },
            ],
            types: ALL,
            feel: "optional",
            requires: [{ kind: "elementType", oneOf: SUBSCRIPTION_ELEMENTS }],
        },
        {
            type: "zeebe:calledElement",
            label: "Called process",
            fields: [
                {
                    key: "property",
                    label: "Attribute",
                    kind: "choice",
                    options: [
                        "processId",
                        "propagateAllChildVariables",
                        "propagateAllParentVariables",
                        "businessId",
                    ],
                    required: true,
                    initial: "processId",
                },
            ],
            types: ALL,
            feel: "optional",
            variants: {
                field: "property",
                values: {
                    propagateAllChildVariables: {
                        types: ["Hidden", "Boolean"],
                        feel: "none",
                        sample: true,
                    },
                    propagateAllParentVariables: {
                        types: ["Hidden", "Boolean"],
                        feel: "none",
                        sample: true,
                    },
                },
            },
            requires: [
                { kind: "elementType", oneOf: [{ value: "bpmn:CallActivity" }] },
                {
                    kind: "binding",
                    binding: { type: "zeebe:calledElement", property: "processId" },
                    label: "the called process id",
                },
            ],
        },
        {
            type: "zeebe:calledDecision",
            label: "Called decision",
            fields: [
                {
                    key: "property",
                    label: "Attribute",
                    kind: "choice",
                    options: ["decisionId", "resultVariable"],
                    required: true,
                    initial: "decisionId",
                },
            ],
            types: TEXTUAL,
            feel: "optional",
            variants: { field: "property", values: { resultVariable: { feel: "none" } } },
            requires: [
                { kind: "elementType", oneOf: [{ value: "bpmn:BusinessRuleTask" }] },
                {
                    kind: "binding",
                    binding: { type: "zeebe:calledDecision", property: "decisionId" },
                    label: "the decision id",
                },
                {
                    kind: "binding",
                    binding: { type: "zeebe:calledDecision", property: "resultVariable" },
                    label: "the result variable",
                },
            ],
        },
        {
            type: "zeebe:script",
            label: "Script",
            fields: [
                {
                    key: "property",
                    label: "Attribute",
                    kind: "choice",
                    options: ["expression", "resultVariable"],
                    required: true,
                    initial: "expression",
                },
            ],
            types: TEXTUAL,
            variants: {
                field: "property",
                values: {
                    expression: { feel: "required", sample: "=input" },
                    resultVariable: { feel: "none" },
                },
            },
            requires: [
                { kind: "elementType", oneOf: [{ value: "bpmn:ScriptTask" }] },
                {
                    kind: "binding",
                    binding: { type: "zeebe:script", property: "expression" },
                    label: "the script expression",
                },
                {
                    kind: "binding",
                    binding: { type: "zeebe:script", property: "resultVariable" },
                    label: "the result variable",
                },
            ],
        },
        {
            type: "zeebe:userTask",
            label: "Camunda user task",
            fields: [],
            types: ["Hidden"],
            feel: "none",
            sample: "",
            requires: [USER_TASK],
        },
        {
            type: "zeebe:formDefinition",
            label: "Form",
            fields: [
                {
                    key: "property",
                    label: "Attribute",
                    kind: "choice",
                    options: ["formId", "externalReference"],
                    required: true,
                    initial: "formId",
                },
            ],
            types: TEXTUAL,
            feel: "optional",
            variants: { field: "property", values: { formId: { feel: "none" } } },
            requires: [USER_TASK, USER_TASK_BINDING],
        },
        {
            type: "zeebe:assignmentDefinition",
            label: "Assignment",
            fields: [
                {
                    key: "property",
                    label: "Attribute",
                    kind: "choice",
                    options: ["assignee", "candidateUsers", "candidateGroups"],
                    required: true,
                    initial: "assignee",
                },
            ],
            types: TEXTUAL,
            feel: "optional",
            requires: [USER_TASK, USER_TASK_BINDING],
        },
    ],
};
