import { describe, expect, it } from "vitest";

import { mergeElementTemplates } from "./elementTemplates";

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
});
