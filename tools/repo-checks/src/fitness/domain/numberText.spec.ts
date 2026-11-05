import { describe, expect, it } from "vitest";

import { groupedDigits } from "./numberText";

describe("grouped digits", () => {
    it.each([
        { count: 7, text: "7" },
        { count: 999, text: "999" },
        { count: 19200, text: "19,200" },
        { count: 1234567, text: "1,234,567" },
    ])("write $count as $text", ({ count, text }) => {
        expect(groupedDigits(count)).toBe(text);
    });
});
