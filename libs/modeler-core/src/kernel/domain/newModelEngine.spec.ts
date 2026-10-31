import { describe, expect, it } from "vitest";

import { newModelEnginePrompt } from "./newModelEngine";

describe("newModelEnginePrompt", () => {
    it("offers Camunda 7, Camunda 8 and the engine-neutral choice, in that order", () => {
        expect(newModelEnginePrompt()).toEqual({
            id: "newModelEngine",
            placeholder: "Select the execution platform.",
            items: [
                { label: "Camunda 7", value: "c7" },
                { label: "Camunda 8", value: "c8" },
                {
                    label: "Engine-neutral",
                    description: "No execution platform — opens in Design mode",
                    value: "neutral",
                },
            ],
        });
    });
});
