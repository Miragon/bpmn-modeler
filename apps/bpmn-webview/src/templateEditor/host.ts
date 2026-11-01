import {
    asProtocolMessage,
    type Command,
    ElementTemplateFileQuery,
    type HostApi,
    HostApiImpl,
    LanguageQuery,
    MockHostApi,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import c7Samples from "../__fixtures__/c7-samples.json";
import c8Samples from "../__fixtures__/c8-samples.json";

declare const process: { env: { NODE_ENV: string } };

type MessageType = Command | Query;

export function getTemplateEditorHostApi(): HostApi<unknown, MessageType> {
    if (process.env.NODE_ENV === "development") {
        return new MockTemplateEditorHost();
    }
    return new HostApiImpl<unknown, MessageType>();
}

const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";
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
        groups: [{}],
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

// Files for the editor's other states, picked with `?file=`.
const FILES: Readonly<Record<string, string>> = {
    empty: "",
    noschema: `${JSON.stringify({ name: "Plain", id: "plain", appliesTo: ["bpmn:ServiceTask"], properties: [] }, null, 2)}\n`,
    broken: '{\n  "name": "Broken",\n',
    notemplate: "[]\n",
    problems: `${JSON.stringify(PROBLEMS, null, 2)}\n`,
};

/**
 * Serves the C8 sample templates, the C7 ones for `?engine=c7`, or one of
 * {@link FILES} for `?file=`. `?lang=de` switches the language once the
 * first template is shown.
 */
class MockTemplateEditorHost extends MockHostApi<unknown, MessageType> {
    override postMessage(message: MessageType): void {
        const command = asProtocolMessage(message);
        if (command.type !== "GetElementTemplateFileCommand") {
            console.debug("[dev] template editor sent", command);
            return;
        }
        const params = new URLSearchParams(window.location.search);
        const samples = params.get("engine") === "c7" ? c7Samples : c8Samples;
        const file = FILES[params.get("file") ?? ""] ?? `${JSON.stringify(samples, null, 2)}\n`;
        dispatch(new ElementTemplateFileQuery(file));
        const lang = params.get("lang");
        if (lang) {
            dispatch(new LanguageQuery(lang));
        }
    }
}

function dispatch(message: MessageType): void {
    window.dispatchEvent(new MessageEvent("message", { data: message }));
}
