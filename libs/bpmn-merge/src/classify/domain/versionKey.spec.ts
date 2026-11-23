import { describe, expect, it } from "vitest";

import { versionKeyOf } from "./versionKey";

describe("versionKeyOf", () => {
    it.each([
        { text: "", key: "cbf29ce484222325" },
        { text: "a", key: "089be207b544f1e4" },
        { text: '<bpmn:task id="Task_1" />', key: "b68c43f495f63975" },
        { text: "Prüfung 🚀", key: "2104b34906388776" },
    ])("is the FNV-1a 64 hash of the UTF-16 text in hex: $text", ({ text, key }) => {
        expect(versionKeyOf(text)).toBe(key);
    });

    it.each([
        ["a", "b"],
        ["ab", "ba"],
        ['name="Check"', 'name="Check "'],
        ["ü", "u"],
    ])("tells %j from %j", (first, second) => {
        expect(versionKeyOf(first)).not.toBe(versionKeyOf(second));
    });
});
