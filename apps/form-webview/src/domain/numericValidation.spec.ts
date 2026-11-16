import { describe, expect, expectTypeOf, it } from "vitest";

import { normalizeValidationBounds } from "./numericValidation";

describe("numeric validation bounds", () => {
    it.each([
        ["min", 0],
        ["min", -2],
        ["min", -2.5],
        ["max", 0],
        ["max", -2],
        ["max", 2.5],
    ] as const)(
        "keeps %s value %s numeric and text-length siblings strings without mutating the input",
        (bound, value) => {
            const validation = Object.freeze({
                min: 0,
                max: 20,
                minLength: 5,
                maxLength: 10,
                required: true,
                [bound]: value,
            });

            expect(normalizeValidationBounds(validation)).toEqual({
                min: 0,
                max: 20,
                minLength: "5",
                maxLength: "10",
                required: true,
                [bound]: value,
            });
            expect(validation).toEqual({
                min: 0,
                max: 20,
                minLength: 5,
                maxLength: 10,
                required: true,
                [bound]: value,
            });
        },
    );

    it.each([
        ["0", 0],
        ["-2", -2],
        ["-2.5", -2.5],
        ["2.5", 2.5],
    ] as const)("stores numeric bound input %s as a number", (input, expected) => {
        expect(normalizeValidationBounds({ min: input, max: input })).toEqual({
            min: expected,
            max: expected,
        });
    });

    it.each([
        "",
        "   ",
        "not a number",
        "Infinity",
        "-Infinity",
        "NaN",
        "= lowerLimit + 1",
        true,
        false,
        null,
        undefined,
    ])("preserves non-literal bound %j without numeric coercion", (value) => {
        expect(normalizeValidationBounds({ min: value, max: value })).toEqual({
            min: value,
            max: value,
        });
    });

    it("preserves expressions, strings, booleans, removals and unrelated numeric options", () => {
        const validation = Object.freeze({
            min: "= lowerLimit + 1",
            max: "= upperLimit",
            minLength: undefined,
            maxLength: "",
            required: false,
            customOption: 7,
        });

        expectTypeOf(normalizeValidationBounds)
            .parameter(0)
            .toEqualTypeOf<Readonly<Record<string, unknown>>>();
        expectTypeOf(normalizeValidationBounds).returns.toEqualTypeOf<Record<string, unknown>>();
        const normalized = normalizeValidationBounds(validation);

        expect(normalized).toEqual(validation);
        expect(normalized).not.toBe(validation);
    });
});
