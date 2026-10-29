import { describe, expect, it } from "vitest";

import { isReferenceKind } from "./referenceKind";

describe("isReferenceKind", () => {
    it.each(["process", "decision", "form"])("accepts %s", (value) => {
        expect(isReferenceKind(value)).toBe(true);
    });

    it.each([
        ["an unknown kind", "script"],
        ["a differently cased kind", "Process"],
        ["the empty string", ""],
        ["an inherited Object key", "toString"],
        ["the prototype key", "__proto__"],
        ["undefined", undefined],
        ["a number", 1],
        ["an array that stringifies to a kind", ["form"]],
    ])("rejects %s", (_label, value) => {
        expect(isReferenceKind(value)).toBe(false);
    });
});
