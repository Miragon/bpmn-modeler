import { describe, expect, it } from "vitest";

import { referenceForDisplay, truncateForDisplay } from "./truncateForDisplay";

describe("referenceForDisplay", () => {
    it.each([
        { behaviour: "keeps a short reference", reference: "pay", shown: "pay" },
        {
            behaviour: "keeps a reference of 100 characters",
            reference: "x".repeat(100),
            shown: "x".repeat(100),
        },
        {
            behaviour: "cuts a reference of 101 characters to 100",
            reference: "x".repeat(101),
            shown: `${"x".repeat(99)}…`,
        },
    ])("$behaviour", ({ reference, shown }) => {
        expect(referenceForDisplay(reference)).toBe(shown);
    });
});

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
