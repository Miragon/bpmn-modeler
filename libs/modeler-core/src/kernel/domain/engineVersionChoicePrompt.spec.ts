import { describe, expect, it } from "vitest";
import { engineVersionChoicePrompt } from "./engineVersionChoicePrompt";

describe("engine version choice presentation", () => {
    it.each([
        ["c7", "Camunda 7"],
        ["c8", "Camunda 8"],
    ] as const)("uses the supplied id and versions for %s", (engine, label) => {
        const versions = Object.freeze(["custom-older", "custom-newer", "custom-older", ""]);
        expect(engineVersionChoicePrompt(engine, versions, "explicitVersionChoice")).toEqual({
            id: "explicitVersionChoice",
            placeholder: `Select ${label} engine version`,
            items: [
                { label: "custom-older", value: "custom-older" },
                { label: "custom-newer", value: "custom-newer" },
                { label: "custom-older", value: "custom-older" },
                { label: "", value: "" },
            ],
        });
    });

    it("does not add a catalogue or default id to an empty choice", () => {
        expect(engineVersionChoicePrompt("c8", Object.freeze([]), "")).toEqual({
            id: "",
            placeholder: "Select Camunda 8 engine version",
            items: [],
        });
    });
});
