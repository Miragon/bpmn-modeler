import { describe, expect, expectTypeOf, it } from "vitest";

import { withStringBounds } from "./numericValidation";

describe("numeric validation bounds", () => {
    it.each(["min", "max", "minLength", "maxLength"])(
        "converts numeric %s and its numeric siblings without mutating the input",
        (bound) => {
            const validation = Object.freeze({
                min: 0,
                max: 20,
                minLength: 5,
                maxLength: 10,
                required: true,
                [bound]: -2.5,
            });

            expect(withStringBounds(validation)).toEqual({
                min: "0",
                max: "20",
                minLength: "5",
                maxLength: "10",
                required: true,
                [bound]: "-2.5",
            });
            expect(validation).toEqual({
                min: 0,
                max: 20,
                minLength: 5,
                maxLength: 10,
                required: true,
                [bound]: -2.5,
            });
        },
    );

    it("preserves expressions, strings, booleans, removals and unrelated numeric options", () => {
        const validation = Object.freeze({
            min: "= lowerLimit + 1",
            max: "20",
            minLength: undefined,
            maxLength: "",
            required: false,
            customOption: 7,
        });

        expectTypeOf(withStringBounds)
            .parameter(0)
            .toEqualTypeOf<Readonly<Record<string, unknown>>>();
        expectTypeOf(withStringBounds).returns.toEqualTypeOf<Record<string, unknown>>();
        const normalized = withStringBounds(validation);

        expect(normalized).toEqual(validation);
        expect(normalized).not.toBe(validation);
    });
});
