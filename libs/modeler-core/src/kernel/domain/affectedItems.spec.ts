import { describe, expect, it } from "vitest";

import { confirmation, summarizeAffectedItems } from "./affectedItems";

const shapes = (count: number) => Array.from({ length: count }, (_, i) => `Shape_${i + 1}`);

describe("summarizeAffectedItems", () => {
    it.each([0, 1, 12])("lists every item when there are at most 12 (%i items)", (count) => {
        expect(summarizeAffectedItems(shapes(count))).toEqual(shapes(count));
    });

    it.each([
        { count: 13, expected: [...shapes(12), "…and 1 more"] },
        { count: 14, expected: [...shapes(12), "…and 2 more"] },
        { count: 40, expected: [...shapes(12), "…and 28 more"] },
    ])("ends a longer list with how many more there are ($count items)", ({ count, expected }) => {
        expect(summarizeAffectedItems(shapes(count))).toEqual(expected);
    });

    it.each([
        { items: ["c", "a", "b"], limit: 3, expected: ["c", "a", "b"] },
        { items: ["e", "d", "c", "b", "a"], limit: 3, expected: ["e", "d", "c", "…and 2 more"] },
    ])("keeps the listed items in order ($items, limit $limit)", ({ items, limit, expected }) => {
        expect(summarizeAffectedItems(items, limit)).toEqual(expected);
    });
});

describe("confirmation", () => {
    it.each<{ behaviour: string; affected: string[]; details: string[] }>([
        { behaviour: "lists nothing when nothing is affected", affected: [], details: [] },
        {
            behaviour: "lists every affected item when there are at most 12",
            affected: shapes(12),
            details: shapes(12),
        },
        {
            behaviour: "counts the affected items past the twelfth",
            affected: shapes(14),
            details: [...shapes(12), "…and 2 more"],
        },
    ])("$behaviour", ({ affected, details }) => {
        expect(
            confirmation({
                id: "deleteTarget",
                title: 'Delete deployment target "dev"?',
                confirmLabel: "Delete",
                affected,
            }),
        ).toEqual({
            id: "deleteTarget",
            title: 'Delete deployment target "dev"?',
            confirmLabel: "Delete",
            details,
        });
    });
});
