import { describe, expect, it } from "vitest";

import { diagnosticsByEntry, entryIdOf } from "./entryIds";

describe("entryIdOf", () => {
    it.each([
        [["name"], "template-name"],
        [["elementType", "value"], "template-elementType-value"],
        [["properties", 2, "label"], "property-2-label"],
        [["properties", 0, "binding", "type"], "property-0-binding-type"],
        [["groups", 1, "id"], "group-1-id"],
        [[], ""],
    ])("names the entry of %j %s", (path, id) => {
        expect(entryIdOf(path)).toBe(id);
    });
});

describe("diagnosticsByEntry", () => {
    const known = new Set(["template-name", "property-0-condition", "property-0-binding-type"]);

    it("attaches a diagnostic to the nearest entry that shows its value", () => {
        const { byEntry, unplaced } = diagnosticsByEntry(
            [
                { path: ["name"], severity: "error", message: "Name it" },
                {
                    path: ["properties", 0, "condition", "allMatch", 1, "property"],
                    severity: "error",
                    message: "Missing",
                },
                {
                    path: ["properties", 0, "binding", "type"],
                    severity: "warning",
                    message: "Needs",
                },
                { path: ["properties", 0, "binding", "type"], severity: "error", message: "Also" },
            ],
            known,
        );

        expect(byEntry).toEqual({
            "template-name": [{ severity: "error", message: "Name it" }],
            "property-0-condition": [{ severity: "error", message: "Missing" }],
            "property-0-binding-type": [
                { severity: "warning", message: "Needs" },
                { severity: "error", message: "Also" },
            ],
        });
        expect(unplaced).toEqual([]);
    });

    it("keeps what no entry shows for the summary", () => {
        const diagnostic = { path: [], severity: "error" as const, message: "Whole template" };

        expect(diagnosticsByEntry([diagnostic], known)).toEqual({
            byEntry: {},
            unplaced: [diagnostic],
        });
    });
});
