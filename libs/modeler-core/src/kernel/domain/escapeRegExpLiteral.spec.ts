import { describe, expect, it } from "vitest";

import { escapeRegExpLiteral } from "./escapeRegExpLiteral";

describe("escapeRegExpLiteral", () => {
    it.each([".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"])(
        "escapes %s",
        (metacharacter) => {
            expect(escapeRegExpLiteral(metacharacter)).toBe(`\\${metacharacter}`);
        },
    );

    it("leaves characters without regex meaning as they are", () => {
        expect(escapeRegExpLiteral("order-process_1:v2/a b")).toBe("order-process_1:v2/a b");
    });

    it("matches the literal verbatim and nothing else", () => {
        const pattern = new RegExp(`^${escapeRegExpLiteral("a.b*(c)|[d]")}$`);

        expect(pattern.test("a.b*(c)|[d]")).toBe(true);
        expect(pattern.test("axbbb(c)|[d]")).toBe(false);
        expect(pattern.test("a.b*c")).toBe(false);
    });
});
