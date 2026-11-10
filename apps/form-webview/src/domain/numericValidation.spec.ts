import { describe, expect, it } from "vitest";

import { normalizeNumericValidation } from "./numericValidation";

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

            expect(normalizeNumericValidation(validation)).toEqual({
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

        const normalized = normalizeNumericValidation(validation);

        expect(normalized).toEqual(validation);
        expect(normalized).not.toBe(validation);
    });

    it.each([undefined, null, false, "", 0, []])(
        "leaves absent or non-object validation unchanged: %s",
        (validation) => {
            expect(normalizeNumericValidation(validation)).toBe(validation);
        },
    );
});
