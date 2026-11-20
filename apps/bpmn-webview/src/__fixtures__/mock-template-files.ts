import { ELEMENT_TEMPLATE_SCHEMA_URL } from "@miragon/bpmn-modeler-types";

const hidden = (binding: Record<string, string>, value = "x") => ({
    type: "Hidden",
    value,
    binding,
});
const input = (name: string, extra: Record<string, unknown> = {}) => ({
    label: name,
    type: "String",
    binding: { type: "zeebe:input", name },
    ...extra,
});

// Every finding of the builder's own rules; one template cannot miss the script's
// expression and its result variable at once, so a second one misses the latter.
const problems = () => [
    {
        $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c8,
        name: "Problems",
        id: "problems",
        appliesTo: ["bpmn:ServiceTask"],
        groups: [{}, { id: "twin" }, { id: "twin" }],
        properties: [
            input("first", { id: "a" }),
            input("second", { id: "a" }),
            input("self", { id: "self", condition: { property: "self", equals: "x" } }),
            input("orphan", { condition: { property: "nope", equals: "x" } }),
            input("grouped", { group: "missing" }),
            input("choice", { type: "Dropdown", value: "c", choices: [{ name: "A", value: "a" }] }),
            hidden({ type: "zeebe:formDefinition", property: "formId" }),
            hidden({ type: "zeebe:formDefinition", property: "externalReference" }),
            hidden({ type: "zeebe:calledElement", property: "propagateAllChildVariables" }, "true"),
            hidden({ type: "zeebe:calledDecision", property: "resultVariable" }),
            hidden({ type: "zeebe:script", property: "resultVariable" }),
            hidden({ type: "bpmn:Message#property", name: "name" }),
            hidden({ type: "zeebe:linkedResource", linkName: "x", property: "resourceId" }),
            hidden({ type: "zeebe:taskDefinition:type" }),
            input("old optional", { optional: true }),
            input("locked FEEL", { feel: "optional", editable: false }),
            { type: "Hidden", binding: { type: "zeebe:input", name: "no value" } },
        ],
    },
    {
        $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c8,
        name: "More problems",
        id: "more-problems",
        appliesTo: ["bpmn:ScriptTask"],
        properties: [hidden({ type: "zeebe:script", property: "expression" }, "=1")],
    },
];

/** The file the preview serves for `?file=`, one per state of the editor, or none for another name. */
export function mockTemplateFile(name: string): string | undefined {
    const files: Readonly<Record<string, string>> = {
        empty: "",
        noschema: `${JSON.stringify({ name: "Plain", id: "plain", appliesTo: ["bpmn:ServiceTask"], properties: [] }, null, 2)}\n`,
        broken: '{\n  "name": "Broken",\n',
        notemplate: "[]\n",
        problems: `${JSON.stringify(problems(), null, 2)}\n`,
        // Valid JSON the builder cannot edit in place, and a type the preview cannot show.
        unshaped: `${JSON.stringify({ $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c8, name: "Unshaped", id: "unshaped", appliesTo: ["bpmn:ServiceTask"], elementType: "bpmn:ServiceTask", properties: [] }, null, 2)}\n`,
        process: `${JSON.stringify({ $schema: ELEMENT_TEMPLATE_SCHEMA_URL.c8, name: "Process", id: "process", appliesTo: ["bpmn:Process"], properties: [] }, null, 2)}\n`,
    };
    return Object.hasOwn(files, name) ? files[name] : undefined;
}
