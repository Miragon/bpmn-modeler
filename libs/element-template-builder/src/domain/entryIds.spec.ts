import { describe, expect, it } from "vitest";

import type { JsonPath } from "./templateText";
import { diagnosticsByEntry, entryIdOf, entryPrefix, entryTarget } from "./entryIds";

describe("entryIdOf", () => {
    it.each([
        [["name"], "template-name"],
        [["elementType", "value"], "template-elementType-value"],
        [["properties", 2, "label"], "property-2-label"],
        [["properties", 0, "binding", "type"], "property-0-binding-type"],
        [["groups", 1, "id"], "group-1-id"],
        [["template"], "template-template"],
        [["constructor"], "template-constructor"],
        [[], ""],
    ])("names the entry of %j %s", (path, id) => {
        expect(entryIdOf(path)).toBe(id);
    });
});

const PATHS: JsonPath[] = [
    ["name"],
    ["elementType", "value"],
    ["properties", 1, "label"],
    ["properties", 10, "binding", "type"],
    ["groups", 1, "id"],
    ["groups", 0, "label"],
];

describe("entryTarget", () => {
    it.each([
        ["template-name", { tab: "template" }],
        ["template-elementType-value", { tab: "template" }],
        ["property-2-label", { tab: "properties", index: 2 }],
        ["property-10-binding-type", { tab: "properties", index: 10 }],
        ["group-1-id", { tab: "groups", index: 1 }],
    ])("shows %s on its tab and item", (entryId, target) => {
        expect(entryTarget(entryId)).toStrictEqual(target);
    });

    it.each(PATHS.map((path) => [path]))("finds the tab and item of the entry at %j", (path) => {
        const [list, index] = path;
        const target =
            list === "properties" || list === "groups" ? { tab: list, index } : { tab: "template" };

        expect(entryTarget(entryIdOf(path))).toStrictEqual(target);
    });
});

describe("entryPrefix", () => {
    it.each([
        ["template", "template-"],
        ["groups", "group-"],
        ["properties", "property-"],
    ] as const)("starts every entry id on the %s tab with %s", (tab, prefix) => {
        expect(entryPrefix(tab)).toBe(prefix);
    });

    it.each([
        ["groups", 1, "group-1-"],
        ["properties", 10, "property-10-"],
    ] as const)("starts every entry id of %s %i with %s", (tab, index, prefix) => {
        expect(entryPrefix(tab, index)).toBe(prefix);
    });

    it.each([
        [() => entryPrefix("template"), ["template-name", "template-elementType-value"]],
        [() => entryPrefix("groups"), ["group-1-id", "group-0-label"]],
        [() => entryPrefix("properties", 1), ["property-1-label"]],
        [() => entryPrefix("groups", 0), ["group-0-label"]],
    ])("matches exactly the ids entryIdOf names on that tab or item (%#)", (prefixOf, ids) => {
        expect(PATHS.map(entryIdOf).filter((id) => id.startsWith(prefixOf()))).toEqual(ids);
    });
});

describe("diagnosticsByEntry", () => {
    const known = new Set([
        "template-name",
        "property-0-condition",
        "property-0-binding-type",
        "property-2-label",
        "group-1-id",
    ]);

    it("attaches a diagnostic to the nearest entry that shows its value", () => {
        const { byEntry, entryIds } = diagnosticsByEntry(
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
        expect(entryIds).toEqual([
            "template-name",
            "property-0-condition",
            "property-0-binding-type",
            "property-0-binding-type",
        ]);
    });

    it.each([
        [["properties", 0, "binding"], "property-0-binding-type"],
        [["properties", 2], "property-2-label"],
        [["properties", 2, "constraints"], "property-2-label"],
        [["groups", 1], "group-1-id"],
    ])("lets the first entry stand for the whole object at %j", (path, id) => {
        const diagnostic = { path, severity: "warning" as const, message: "Deprecated" };

        expect(diagnosticsByEntry([diagnostic], known)).toEqual({
            byEntry: { [id]: [{ severity: "warning", message: "Deprecated" }] },
            entryIds: [id],
        });
    });

    it("keeps what no entry shows for the summary", () => {
        const diagnostic = { path: [], severity: "error" as const, message: "Whole template" };

        expect(diagnosticsByEntry([diagnostic], known)).toEqual({
            byEntry: {},
            entryIds: [undefined],
        });
    });
});
