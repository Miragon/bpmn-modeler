import { describe, expect, it } from "vitest";

import { truncateForDisplay } from "./truncateForDisplay";

describe("truncateForDisplay", () => {
    it.each([
        { behaviour: "keeps a value shorter than the limit", value: "abc", max: 5, shown: "abc" },
        { behaviour: "keeps a value exactly at the limit", value: "abcde", max: 5, shown: "abcde" },
        {
            behaviour: "cuts a longer value to the limit, the ellipsis included",
            value: "abcdef",
            max: 5,
            shown: "abcd…",
        },
        {
            behaviour: "cuts a very long value to the same length",
            value: "x".repeat(500),
            max: 100,
            shown: `${"x".repeat(99)}…`,
        },
        { behaviour: "keeps an empty value", value: "", max: 5, shown: "" },
        {
            behaviour: "leaves only the ellipsis at a limit of one",
            value: "ab",
            max: 1,
            shown: "…",
        },
    ])("$behaviour", ({ value, max, shown }) => {
        expect(truncateForDisplay(value, max)).toBe(shown);
    });
});
