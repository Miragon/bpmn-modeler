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
                description: "Create a new empty BPMN diagram",
                filterLabel: "BPMN",
                extension: "bpmn",
                defaultFileName: "new-diagram.bpmn",
            },
        ],
        [
            newDmnModelFilePrompt,
            {
                title: "New DMN Model",
                description: "Create a new empty DMN decision",
                filterLabel: "DMN",
                extension: "dmn",
                defaultFileName: "new-diagram.dmn",
            },
        ],
        [
            newFormModelFilePrompt,
            {
                title: "New Camunda Form",
                description: "Create a new empty Camunda form",
                filterLabel: "Camunda Form",
                extension: "form",
                defaultFileName: "new-form.form",
            },
        ],
    ] as const)("builds %j", (build, expected) => {
        expect(build()).toEqual(expected);
    });
});
