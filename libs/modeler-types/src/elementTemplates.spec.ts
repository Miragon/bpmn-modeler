import { describe, expect, it } from "vitest";

import FILE_CASES from "./elementTemplateFile.cases.json";
import {
    detectTemplateEngine,
    ELEMENT_TEMPLATE_SCHEMA_URL,
    isElementTemplateFile,
    isElementTemplateText,
    templatesOfFile,
} from "./elementTemplates";

const C7_SCHEMA = "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";
const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";

function withBinding(type: string): object {
    return { name: "T", properties: [{ binding: { type, name: "x" } }] };
}

describe("templatesOfFile", () => {
    it("accepts a single template or an array of them", () => {
        expect(templatesOfFile({ name: "One" })).toEqual([{ name: "One" }]);
        expect(templatesOfFile([{ name: "A" }, { name: "B" }])).toEqual([
            { name: "A" },
            { name: "B" },
        ]);
    });
});

describe("ELEMENT_TEMPLATE_SCHEMA_URL", () => {
    it("names the published schema of each engine", () => {
        expect(ELEMENT_TEMPLATE_SCHEMA_URL).toEqual({ c7: C7_SCHEMA, c8: C8_SCHEMA });
    });
});

describe("detectTemplateEngine", () => {
    it.each([
        ["the C7 schema", { $schema: C7_SCHEMA }, "c7"],
        ["the C8 schema", { $schema: C8_SCHEMA }, "c8"],
        [
            "a version-pinned C8 schema",
            {
                $schema:
                    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema@0.46.0/resources/schema.json",
            },
            "c8",
        ],
        [
            "a version-pinned C7 schema",
            {
                $schema:
                    "https://unpkg.com/@camunda/element-templates-json-schema@0.22.1/resources/schema.json",
            },
            "c7",
        ],
    ])("reads the engine from %s", (_, template, engine) => {
        expect(detectTemplateEngine(template)).toBe(engine);
    });

    it("prefers the schema over contradicting bindings", () => {
        expect(
            detectTemplateEngine({ ...withBinding("camunda:property"), $schema: C8_SCHEMA }),
        ).toBe("c8");
    });

    it.each([
        ["zeebe:input", "c8"],
        ["zeebe:taskDefinition", "c8"],
        ["bpmn:Message#zeebe:subscription#property", "c8"],
        ["camunda:property", "c7"],
        ["camunda:inputParameter", "c7"],
    ])("falls back to the %s binding", (type, engine) => {
        expect(detectTemplateEngine(withBinding(type))).toBe(engine);
    });

    it("ignores bindings both engines share", () => {
        expect(detectTemplateEngine(withBinding("property"))).toBeUndefined();
    });

    it.each([
        ["^8.6", "c8"],
        [">=8.5", "c8"],
        ["^7.21", "c7"],
    ])("falls back to the %s engine range", (range, engine) => {
        expect(detectTemplateEngine({ name: "T", engines: { camunda: range } })).toBe(engine);
    });

    it("takes the first template of an array that names an engine", () => {
        expect(detectTemplateEngine([{ name: "plain" }, { $schema: C7_SCHEMA }])).toBe("c7");
    });

    it.each([
        ["an unknown schema", { $schema: "https://example.com/other.json" }],
        ["a template without signals", { name: "T", properties: [] }],
        ["an unparseable engine range", { engines: { camunda: "latest" } }],
        ["malformed properties", { properties: [null, { binding: 3 }, "x"] }],
        ["null", null],
        ["a string", "zeebe:input"],
        ["an empty array", []],
    ])("returns undefined for %s", (_, input) => {
        expect(detectTemplateEngine(input)).toBeUndefined();
    });
});

describe("isElementTemplateText", () => {
    it.each([
        ["a C7 template", `{\n  "$schema": "${C7_SCHEMA}",\n  "name": "T"\n}`],
        ["a C8 template", `{"$schema":"${C8_SCHEMA}"}`],
        ["an array file", `[\n  {\n    "$schema" : "${C8_SCHEMA}"\n  }\n]`],
    ])("recognises %s", (_, text) => {
        expect(isElementTemplateText(text)).toBe(true);
    });

    it.each([
        ["an unrelated JSON file", `{"$schema":"https://json.schemastore.org/package.json"}`],
        ["a template schema outside $schema", `{"description":"${C8_SCHEMA}"}`],
        ["an empty file", ""],
    ])("rejects %s", (_, text) => {
        expect(isElementTemplateText(text)).toBe(false);
    });

    it("only scans the head so a large file stays cheap", () => {
        const late = `{"icon":"${"x".repeat(10_000)}","$schema":"${C8_SCHEMA}"}`;
        expect(isElementTemplateText(late)).toBe(false);
    });
});

// The IntelliJ host's copy of the rule runs the same rows.
describe("isElementTemplateFile", () => {
    it.each(FILE_CASES)("$name", ({ path, text, isTemplate }) => {
        expect(isElementTemplateFile(path, text)).toBe(isTemplate);
    });
});
