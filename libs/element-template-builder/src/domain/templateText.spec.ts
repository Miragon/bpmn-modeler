import { describe, expect, it } from "vitest";

import { applyTemplateEdits, textFormatOf } from "./templateText";

const TEMPLATE = `{
  "$schema": "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
  "name": "Status",
  "id": "status",
  "version": 1,
  "x-custom": { "keep": true },
  "appliesTo": ["bpmn:ServiceTask"],
  "properties": [
    {
      "label": "Status",
      "type": "String",
      "binding": { "type": "zeebe:input", "name": "status" }
    }
  ]
}
`;

describe("textFormatOf", () => {
    it.each([
        ["two spaces", '{\n  "a": 1\n}', { insertSpaces: true, tabSize: 2, eol: "\n" }],
        [
            "four spaces",
            '{\n    "a": {\n        "b": 1\n    }\n}',
            { insertSpaces: true, tabSize: 4, eol: "\n" },
        ],
        ["tabs", '{\n\t"a": 1\n}', { insertSpaces: false, tabSize: 1, eol: "\n" }],
        ["CRLF", '{\r\n  "a": 1\r\n}', { insertSpaces: true, tabSize: 2, eol: "\r\n" }],
        ["a single line", '{"a":1}', { insertSpaces: true, tabSize: 2, eol: "\n" }],
    ])("reads %s", (_, text, format) => {
        expect(textFormatOf(text)).toEqual(format);
    });
});

describe("applyTemplateEdits", () => {
    it("changes only the edited value", () => {
        const edited = applyTemplateEdits(
            TEMPLATE,
            [],
            [{ kind: "set", path: ["properties", 0, "label"], value: "New status" }],
        );

        expect(edited).toBe(TEMPLATE.replace('"label": "Status"', '"label": "New status"'));
    });

    it("keeps keys it does not know about", () => {
        const edited = applyTemplateEdits(
            TEMPLATE,
            [],
            [{ kind: "set", path: ["name"], value: "Renamed" }],
        );

        expect(JSON.parse(edited)["x-custom"]).toEqual({ keep: true });
    });

    it("adds a new key where it belongs instead of at the end", () => {
        const edited = applyTemplateEdits(
            TEMPLATE,
            [],
            [{ kind: "set", path: ["description"], value: "Sets a status" }],
        );

        expect(Object.keys(JSON.parse(edited))).toEqual([
            "$schema",
            "name",
            "id",
            "version",
            "description",
            "x-custom",
            "appliesTo",
            "properties",
        ]);
        expect(edited).toContain('"version": 1,\n  "description": "Sets a status",\n');
    });

    it("orders new property and binding keys the same way", () => {
        const edited = applyTemplateEdits(
            TEMPLATE,
            [],
            [
                { kind: "set", path: ["properties", 0, "value"], value: "open" },
                { kind: "set", path: ["properties", 0, "description"], value: "The new status" },
            ],
        );

        expect(Object.keys(JSON.parse(edited).properties[0])).toEqual([
            "label",
            "description",
            "type",
            "value",
            "binding",
        ]);
    });

    it("creates missing objects on the way to a value", () => {
        const edited = applyTemplateEdits(
            TEMPLATE,
            [],
            [{ kind: "set", path: ["properties", 0, "constraints", "notEmpty"], value: true }],
        );

        expect(JSON.parse(edited).properties[0].constraints).toEqual({ notEmpty: true });
    });

    it("removes a key", () => {
        const edited = applyTemplateEdits(TEMPLATE, [], [{ kind: "remove", path: ["version"] }]);

        expect(JSON.parse(edited)).not.toHaveProperty("version");
        expect(edited).toContain('"id": "status",\n  "x-custom"');
    });

    it("inserts into an array at an index", () => {
        const edited = applyTemplateEdits(
            TEMPLATE,
            [],
            [{ kind: "insert", path: ["properties", 0], value: { label: "First" } }],
        );

        expect(JSON.parse(edited).properties.map((p: { label: string }) => p.label)).toEqual([
            "First",
            "Status",
        ]);
    });

    it("edits the selected template of an array file", () => {
        const file = `[\n  { "name": "A", "id": "a" },\n  { "name": "B", "id": "b" }\n]\n`;

        const edited = applyTemplateEdits(
            file,
            [1],
            [{ kind: "set", path: ["name"], value: "Bee" }],
        );

        expect(edited).toBe(file.replace('"name": "B"', '"name": "Bee"'));
    });

    it.each([
        ["CRLF line endings", TEMPLATE.replaceAll("\n", "\r\n"), "\r\n"],
        ["tab indentation", TEMPLATE.replaceAll("  ", "\t"), "\t"],
    ])("keeps %s in inserted text", (_, text, marker) => {
        const edited = applyTemplateEdits(
            text,
            [],
            [{ kind: "set", path: ["description"], value: "Sets a status" }],
        );

        const inserted = edited.slice(edited.indexOf('"version"'), edited.indexOf('"x-custom"'));
        expect(inserted).toContain(marker);
        expect(JSON.parse(edited).description).toBe("Sets a status");
    });

    it("applies edits in order", () => {
        const edited = applyTemplateEdits(
            TEMPLATE,
            [],
            [
                { kind: "set", path: ["name"], value: "One" },
                { kind: "set", path: ["name"], value: "Two" },
            ],
        );

        expect(JSON.parse(edited).name).toBe("Two");
    });
});
