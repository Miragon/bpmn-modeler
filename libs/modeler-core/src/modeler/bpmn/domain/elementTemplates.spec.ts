import { describe, expect, it } from "vitest";

import { configFolderOfArea } from "../../../kernel/domain/configArtifacts";
import {
    mergeElementTemplates,
    templateFileReadingOf,
    templatesDirOf,
    templatesOfFileText,
} from "./elementTemplates";

describe("mergeElementTemplates", () => {
    it("sorts by name and keeps source order for equal names", () => {
        const merged = mergeElementTemplates([
            { fileCount: 1, templates: [{ name: "Task", id: "near" }, { name: "Alpha" }] },
            { fileCount: 1, templates: [{ name: "Task", id: "root" }, { id: "unnamed" }] },
        ]);

        expect(merged).toEqual([
            { id: "unnamed" },
            { name: "Alpha" },
            { name: "Task", id: "near" },
            { name: "Task", id: "root" },
        ]);
    });

    it("sorts an unnamed template before a named one from a later source", () => {
        const merged = mergeElementTemplates([
            { fileCount: 1, templates: [{ id: "unnamed" }] },
            { fileCount: 1, templates: [{ name: "Alpha" }] },
        ]);

        expect(merged).toEqual([{ id: "unnamed" }, { name: "Alpha" }]);
    });
});

describe("templatesOfFileText", () => {
    it.each([
        ["", []],
        [" \n\t", []],
        ['{"name":"Task"}', [{ name: "Task" }]],
        ['[{"name":"A"},{"name":"B"}]', [{ name: "A" }, { name: "B" }]],
    ])("reads the templates of %j", (text, templates) => {
        expect(templatesOfFileText(text)).toEqual(templates);
    });

    it("throws for text that is not JSON", () => {
        expect(() => templatesOfFileText("{ not json")).toThrow(SyntaxError);
    });
});

describe("templateFileReadingOf", () => {
    const C8_SCHEMA =
        "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";

    it.each([
        { case: "a blank file", text: "", reading: { kind: "read", templates: [] } },
        {
            case: "one template with its id, name and version",
            text: JSON.stringify({ id: "mail", name: "Send Mail", version: 3 }),
            reading: { kind: "read", templates: [{ id: "mail", name: "Send Mail", version: 3 }] },
        },
        {
            case: "every template of an array, in file order",
            text: JSON.stringify([{ id: "b" }, { id: "a", name: "A" }]),
            reading: { kind: "read", templates: [{ id: "b" }, { id: "a", name: "A" }] },
        },
        {
            case: "the engine the file names",
            text: JSON.stringify({ id: "c8", $schema: C8_SCHEMA }),
            reading: { kind: "read", templates: [{ id: "c8", engine: "c8" }] },
        },
        {
            case: "only the fields of their own type",
            text: JSON.stringify([{ id: 1, name: ["x"], version: "2" }, null, "text"]),
            reading: { kind: "read", templates: [{}, {}, {}] },
        },
    ])("reads $case", ({ text, reading }) => {
        expect(templateFileReadingOf(text)).toEqual(reading);
    });

    it("gives each template its own engine, else the one its file names, as the builder does", () => {
        const C7_SCHEMA =
            "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";
        const text = JSON.stringify([
            { id: "c7", $schema: C7_SCHEMA },
            { id: "c8", $schema: C8_SCHEMA },
            { id: "plain" },
        ]);

        expect(templateFileReadingOf(text)).toEqual({
            kind: "read",
            templates: [
                { id: "c7", engine: "c7" },
                { id: "c8", engine: "c8" },
                { id: "plain", engine: "c7" },
            ],
        });
    });

    it("says why a file that is not JSON cannot be read", () => {
        const reading = templateFileReadingOf("{ not json");

        expect(reading.kind).toBe("unreadable");
        expect(reading).toHaveProperty("reason", expect.stringMatching(/JSON/));
    });
});

describe("templates folders", () => {
    it.each([
        ["/work", ".camunda", "/work/.camunda/element-templates"],
        ["/work/orders", "config/bpmn", "/work/orders/config/bpmn/element-templates"],
    ])(
        "keeps the templates of %s with config folder %s in %s",
        (dir, configFolder, templatesDir) => {
            expect(templatesDirOf(dir, configFolder)).toBe(templatesDir);
            expect(configFolderOfArea(templatesDir)).toBe(`${dir}/${configFolder}`);
        },
    );
});
