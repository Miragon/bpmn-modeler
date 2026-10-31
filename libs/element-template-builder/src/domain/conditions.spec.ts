import { describe, expect, it } from "vitest";

import { conditionOf, conditionRows } from "./conditions";

const TYPES: Record<string, string> = { mode: "String", count: "Number", enabled: "Boolean" };
const typeOf = (id: string) => TYPES[id];

describe("conditionRows", () => {
    it.each([
        ["no condition", undefined, []],
        [
            "an equals condition",
            { property: "mode", equals: "fast" },
            [{ property: "mode", operator: "equals", value: "fast" }],
        ],
        [
            "a oneOf condition",
            { property: "count", oneOf: [1, 2] },
            [{ property: "count", operator: "oneOf", value: "1, 2" }],
        ],
        [
            "an isActive condition",
            { property: "enabled", isActive: false },
            [{ property: "enabled", operator: "isActive", value: "false" }],
        ],
        [
            "allMatch",
            {
                allMatch: [
                    { property: "mode", isEmpty: true },
                    { property: "enabled", equals: true },
                ],
            },
            [
                { property: "mode", operator: "isEmpty", value: "true" },
                { property: "enabled", operator: "equals", value: "true" },
            ],
        ],
    ])("reads %s", (_, condition, rows) => {
        expect(conditionRows(condition)).toEqual(rows);
    });
});

describe("conditionOf", () => {
    it("writes nothing for no rows", () => {
        expect(conditionOf([], typeOf)).toBeUndefined();
    });

    it.each([
        [
            "text",
            { property: "mode", operator: "equals", value: "fast" },
            { property: "mode", equals: "fast" },
        ],
        [
            "a number",
            { property: "count", operator: "equals", value: "3" },
            { property: "count", equals: 3 },
        ],
        [
            "a flag",
            { property: "enabled", operator: "equals", value: "true" },
            { property: "enabled", equals: true },
        ],
        [
            "a list",
            { property: "mode", operator: "oneOf", value: "a, b,," },
            { property: "mode", oneOf: ["a", "b"] },
        ],
        [
            "a list of numbers",
            { property: "count", operator: "oneOf", value: "1,2" },
            { property: "count", oneOf: [1, 2] },
        ],
        [
            "shown",
            { property: "mode", operator: "isActive", value: "true" },
            { property: "mode", isActive: true },
        ],
        [
            "empty",
            { property: "mode", operator: "isEmpty", value: "false" },
            { property: "mode", isEmpty: false },
        ],
    ] as const)("writes a comparison with %s", (_, row, condition) => {
        expect(conditionOf([row], typeOf)).toEqual(condition);
    });

    it("joins several rows with allMatch", () => {
        expect(
            conditionOf(
                [
                    { property: "mode", operator: "equals", value: "fast" },
                    { property: "enabled", operator: "isActive", value: "true" },
                ],
                typeOf,
            ),
        ).toEqual({
            allMatch: [
                { property: "mode", equals: "fast" },
                { property: "enabled", isActive: true },
            ],
        });
    });

    it("round-trips what it reads", () => {
        const condition = {
            allMatch: [
                { property: "count", oneOf: [1, 2] },
                { property: "mode", isEmpty: true },
            ],
        };

        expect(conditionOf(conditionRows(condition), typeOf)).toEqual(condition);
    });
});
