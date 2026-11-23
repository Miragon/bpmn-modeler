import { describe, expect, it } from "vitest";

import { formatErrors } from "./errors";

describe("formatErrors", () => {
    it("renders each entry as its own bullet line", () => {
        expect(formatErrors(["unknown attribute <foo>", "unresolved reference <Flow_1>"])).toBe(
            "\n- unknown attribute <foo>\n- unresolved reference <Flow_1>",
        );
    });

    it("renders the message of the warning objects bpmn-js reports despite its string[] typing", () => {
        const importWarnings = [{ message: "unresolved reference <Flow_1>", element: {} }];

        expect(formatErrors(importWarnings)).toBe("\n- unresolved reference <Flow_1>");
    });

    it("renders nothing for an empty or missing list", () => {
        expect(formatErrors([])).toBe("");
        expect(formatErrors(undefined as unknown as string[])).toBe("");
    });
});
