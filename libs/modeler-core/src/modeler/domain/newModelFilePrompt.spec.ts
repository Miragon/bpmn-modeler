import { describe, expect, it } from "vitest";
import {
    newBpmnModelFilePrompt,
    newDmnModelFilePrompt,
    newFormModelFilePrompt,
} from "./newModelFilePrompt";

describe("new model file prompts", () => {
    it.each([
        [
            newBpmnModelFilePrompt,
            {
                title: "New BPMN Model",
                filterLabel: "BPMN",
                extension: "bpmn",
                defaultFileName: "new-diagram.bpmn",
            },
        ],
        [
            newDmnModelFilePrompt,
            {
                title: "New DMN Model",
                filterLabel: "DMN",
                extension: "dmn",
                defaultFileName: "new-diagram.dmn",
            },
        ],
        [
            newFormModelFilePrompt,
            {
                title: "New Camunda Form",
                filterLabel: "Camunda Form",
                extension: "form",
                defaultFileName: "new-form.form",
            },
        ],
    ] as const)("builds %j", (build, expected) => {
        expect(build()).toEqual(expected);
    });
});
