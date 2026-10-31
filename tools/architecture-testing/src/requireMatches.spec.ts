import { describe, expect, it } from "vitest";

import { requireMatches } from "./requireMatches";

describe("requireMatches", () => {
    it.each([{ items: ["a"] }, { items: new Set(["a"]) }, { items: new Map([["a", 1]]) }])(
        "hands back a non-empty $items",
        ({ items }) => {
            expect(requireMatches("files", items)).toBe(items);
        },
    );

    it.each([{ items: [] }, { items: new Set() }])("throws on an empty $items", ({ items }) => {
        expect(() => requireMatches("design/ sources", items)).toThrow(
            "design/ sources matched nothing",
        );
    });
});
