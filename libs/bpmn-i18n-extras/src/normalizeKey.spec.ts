import { describe, expect, it } from "vitest";

import { normalizeKey } from "./normalizeKey";

describe("normalizeKey", () => {
    it.each([
        ["Business Key", "Business key"],
        ["Open  the   form", "open form"],
        ["Element actions.", "element actions"],
        ["Read-only ", "read-only"],
        ["The form", "Form"],
        ["Element actions .", "element actions"],
    ])("treats %j as a variant of %j", (variant, modern) => {
        expect(normalizeKey(variant)).toBe(normalizeKey(modern));
    });

    it("keeps a word that only contains 'the'", () => {
        expect(normalizeKey("Other theme")).toBe("other theme");
    });
});
