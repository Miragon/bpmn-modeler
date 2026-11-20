import { ElementTemplateFileQuery, LanguageQuery, type Query } from "@miragon/bpmn-modeler-shared";

import { ELEMENT_TEMPLATE_SCHEMA_URL, type Engine, isEngine } from "@miragon/bpmn-modeler-types";

import c7Samples from "../../../../__fixtures__/c7-samples.json";
import c8Samples from "../../../../__fixtures__/c8-samples.json";

const SAMPLES: Record<Engine, unknown> = { c7: c7Samples, c8: c8Samples };

const C8_SCHEMA = ELEMENT_TEMPLATE_SCHEMA_URL.c8;
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
const PROBLEMS = [
    {
        $schema: C8_SCHEMA,
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
        $schema: C8_SCHEMA,
        name: "More problems",
        id: "more-problems",
        appliesTo: ["bpmn:ScriptTask"],
        properties: [hidden({ type: "zeebe:script", property: "expression" }, "=1")],
    },
];

// Files for the editor's other states, picked with `?file=`. Each is built on
// demand: a module-level interpolation would keep the samples in production.
const FILES: Readonly<Record<string, () => string>> = {
    empty: () => "",
    noschema: () => jsonFile({ name: "Plain", id: "plain", appliesTo: ["bpmn:ServiceTask"], properties: [] }),
    broken: () => '{\n  "name": "Broken",\n',
    notemplate: () => "[]\n",
    problems: () => jsonFile(PROBLEMS),
    // Valid JSON the builder cannot edit in place, and a type the preview cannot show.
    unshaped: () => jsonFile({ $schema: C8_SCHEMA, name: "Unshaped", id: "unshaped", appliesTo: ["bpmn:ServiceTask"], elementType: "bpmn:ServiceTask", properties: [] }),
    process: () => jsonFile({ $schema: C8_SCHEMA, name: "Process", id: "process", appliesTo: ["bpmn:Process"], properties: [] }),
};

function jsonFile(content: unknown): string {
    return `${JSON.stringify(content, null, 2)}\n`;
}

/**
 * The C8 sample templates, the C7 ones for `?engine=c7`, or one of
 * {@link FILES} for `?file=`; `?lang=de` switches the language once the
 * first template is shown.
 */
export function previewTemplateFile(search: string): Query[] {
    const params = new URLSearchParams(search);
    const engine = params.get("engine");
    const samples = SAMPLES[isEngine(engine) ? engine : "c8"];
    const file = FILES[params.get("file") ?? ""]?.() ?? jsonFile(samples);
    const lang = params.get("lang");
    return lang
        ? [new ElementTemplateFileQuery(file), new LanguageQuery(lang)]
        : [new ElementTemplateFileQuery(file)];
}
