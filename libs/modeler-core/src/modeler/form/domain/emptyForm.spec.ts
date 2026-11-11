import { afterEach, describe, expect, it, vi } from "vitest";

import { formVersionPrompt } from "./formEngine";
import { createEmptyForm } from "./emptyForm";

afterEach(() => vi.restoreAllMocks());

describe("createEmptyForm", () => {
    it("creates a form with a random eight-character id suffix", () => {
        const random = vi.spyOn(Math, "random").mockReturnValue(0);

        const firstForm = JSON.parse(createEmptyForm());
        random.mockReturnValue(0.99);
        const secondForm = JSON.parse(createEmptyForm()) as { id: string };

        expect(firstForm).toEqual({
            components: [],
            type: "default",
            id: "Form_AAAAAAAA",
            executionPlatform: "Camunda Cloud",
            executionPlatformVersion: "8.10.0",
        });
        expect(secondForm.id).toBe("Form_99999999");
        expect(firstForm.executionPlatformVersion).toBe(formVersionPrompt("c8").items[0].value);
        expect(random).toHaveBeenCalledTimes(16);
    });
});
