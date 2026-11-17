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
        ["0.1", 0.1],
        [".50", 0.5],
        ["0002.5000", 2.5],
        ["10.50", 10.5],
        ["1e-1", 0.1],
        ["2500e-3", 2.5],
        ["5.", 5],
        ["-25E-1", -2.5],
        ["-0.000e+999", -0],
        ["1e21", 1e21],
        ["1e-7", 1e-7],
        ["9007199254740992", 9007199254740992],
    ] as const)("stores numeric bound input %s as a number", (input, expected) => {
        expect(normalizeValidationBounds({ min: input, max: input })).toEqual({
            min: expected,
            max: expected,
        });
    });

    it.each([
        "9007199254740993",
        "0.1234567890123456789",
        "9.007199254740993e15",
        "1e-400",
        "-0.1234567890123456789",
    ])(
        "preserves both bound strings %s when numeric conversion would change their value",
        (value) => {
            const validation = Object.freeze({ min: value, max: value, required: true });

            expect(normalizeValidationBounds(validation)).toEqual({
                min: value,
                max: value,
                required: true,
            });
            expect(validation).toEqual({ min: value, max: value, required: true });
        },
    );

    it.each([
        "",
        "   ",
        "not a number",
        "Infinity",
        "-Infinity",
        "NaN",
        "1e400",
        "0x10",
        "+5",
        "5px",
        " 5 ",
        "5 ",
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

    it("preserves a numeric-looking array bound without coercion", () => {
        const value = [5];

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
