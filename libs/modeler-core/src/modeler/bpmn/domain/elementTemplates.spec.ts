import { describe, expect, it } from "vitest";

import { mergeElementTemplates, templatesOfFileText } from "./elementTemplates";

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
