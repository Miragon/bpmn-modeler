import { describe, expect, it } from "vitest";

import { isDigestValue } from "./reviewFacts";

describe("isDigestValue", () => {
    it.each([
        [
            "a sha-256 hex digest",
            "526573697a65205461736b7300000000000000000000000000000000000000ab",
            true,
        ],
        ["upper-case hex", "ABCDEF0123456789ABCDEF0123456789", true],
        ["a short hex word", "ab12", false],
        ["a path", ".camunda/plugins/resize", false],
        ["hex with a space", "abcdef0123456789 abcdef0123456789", false],
        ["a sentence that holds a digest", "Hash abcdef0123456789abcdef0123456789", false],
    ])("%s: %s", (_, value, expected) => {
        expect(isDigestValue(value)).toBe(expected);
    });
});
