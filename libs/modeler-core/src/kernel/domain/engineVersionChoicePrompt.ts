import { ENGINE_LABEL, Engine } from "@miragon/bpmn-modeler-types";
import { ChoicePrompt } from "./prompts";

export function engineVersionChoicePrompt(
    engine: Engine,
    versions: readonly string[],
    promptId: string,
): ChoicePrompt<string> {
    return {
        id: promptId,
        placeholder: `Select ${ENGINE_LABEL[engine]} engine version`,
        items: versions.map((version) => ({ label: version, value: version })),
    };
}
