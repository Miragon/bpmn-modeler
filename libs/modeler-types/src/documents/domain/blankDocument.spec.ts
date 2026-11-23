import { describe, expect, it } from "vitest";

import { isBlankDocument } from "./blankDocument";

describe("isBlankDocument", () => {
    it.each([
        { text: undefined, blank: true },
        { text: "", blank: true },
        { text: "\n", blank: true },
        { text: "  \t", blank: true },
        { text: "\r\n  \n", blank: true },
        { text: '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions />', blank: false },
        { text: "  <definitions />\n", blank: false },
    ])("decides $text as blank: $blank", ({ text, blank }) => {
        expect(isBlankDocument(text)).toBe(blank);
    });
});
