import { describe, expect, it } from "vitest";

import CASES from "./elementTemplateFile.cases.json";
import {
    detectTemplateEngine,
    ELEMENT_TEMPLATE_SCHEMA_URL,
    elementTemplateFolder,
    elementTemplateRefKey,
    elementTemplateRefOf,
    isElementTemplateFile,
    isElementTemplateText,
    isPreviewableElementType,
    isSameElementTemplateRef,
    templateEngineOf,
    templatesOfFile,
} from "./elementTemplates";

const C7_SCHEMA = "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";
const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";

function withBinding(type: string): object {
    return { name: "T", properties: [{ binding: { type, name: "x" } }] };
}

describe("isPreviewableElementType", () => {
    it.each([
        ["bpmn:ServiceTask", true],
        ["bpmn:SubProcess", true],
        ["bpmn:Process", false],
        ["bpmn:SequenceFlow", false],
    ])("judges %s", (type, previewable) => {
        expect(isPreviewableElementType(type)).toBe(previewable);
    });
});

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

describe("templateEngineOf", () => {
    const file = [{ name: "plain" }, { $schema: C7_SCHEMA }, { $schema: C8_SCHEMA }];

    it.each([
        ["its own engine", file[2], "c8"],
        ["its file's engine when it names none", file[0], "c7"],
    ])("takes %s", (_, template, engine) => {
        expect(templateEngineOf(template, file)).toBe(engine);
    });

    it("names none when neither the template nor its file does", () => {
        expect(templateEngineOf({ name: "plain" }, [{ name: "plain" }])).toBeUndefined();
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

// The IntelliJ host's copy of these rules runs the same rows.
describe("elementTemplateFolder", () => {
    it.each(CASES.folders)("reads $configFolder as $folder", ({ configFolder, folder }) => {
        expect(elementTemplateFolder(configFolder)).toBe(folder);
    });
});

describe("isElementTemplateFile", () => {
    it.each(CASES.files)("$name", ({ path, configFolder, text, isTemplate }) => {
        expect(isElementTemplateFile(path, text, configFolder)).toBe(isTemplate);
    });
});

describe("elementTemplateRefOf", () => {
    it.each([
        ["a versioned template", { id: "a", version: 2, name: "A" }, { id: "a", version: 2 }],
        ["a template without a version", { id: "a", name: "A" }, { id: "a" }],
        ["a version that is not a number", { id: "a", version: "2" }, { id: "a" }],
        ["version 0", { id: "a", version: 0 }, { id: "a", version: 0 }],
    ])("names %s by id and version", (_, template, ref) => {
        expect(elementTemplateRefOf(template)).toStrictEqual(ref);
    });

    it.each([
        ["a template without an id", { name: "A" }],
        ["a numeric id", { id: 3 }],
        ["null", null],
        ["a string", "a"],
        ["an array", [{ id: "a" }]],
    ])("names no ref for %s", (_, template) => {
        expect(elementTemplateRefOf(template)).toBeUndefined();
    });
});

describe("elementTemplateRefKey", () => {
    it("is the same for a ref with and without an undefined version", () => {
        expect(elementTemplateRefKey({ id: "a", version: undefined })).toBe(
            elementTemplateRefKey({ id: "a" }),
        );
    });

    it.each([
        ["versions", { id: "a", version: 1 }, { id: "a", version: 2 }],
        ["a version and none", { id: "a", version: 1 }, { id: "a" }],
        ["ids", { id: "a" }, { id: "b" }],
        ["an id holding the version", { id: 'a",1' }, { id: "a", version: 1 }],
        ["version 0 and none", { id: "a", version: 0 }, { id: "a" }],
    ])("tells %s apart", (_, first, second) => {
        expect(elementTemplateRefKey(first)).not.toBe(elementTemplateRefKey(second));
    });
});

describe("isSameElementTemplateRef", () => {
    it.each([
        ["the same id and version", { id: "a", version: 2 }, { id: "a", version: 2 }, true],
        ["the same id, both without a version", { id: "a" }, { id: "a" }, true],
        ["an undefined version and none", { id: "a", version: undefined }, { id: "a" }, true],
        ["other versions", { id: "a", version: 1 }, { id: "a", version: 2 }, false],
        ["a version and none", { id: "a", version: 1 }, { id: "a" }, false],
        ["version 0 and none", { id: "a", version: 0 }, { id: "a" }, false],
        ["other ids", { id: "a", version: 1 }, { id: "b", version: 1 }, false],
    ])("matches %s: %j and %j", (_, ref, other, same) => {
        expect(isSameElementTemplateRef(ref, other)).toBe(same);
    });
});
