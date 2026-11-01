import { ENGINE_LABEL, Engine } from "@miragon/bpmn-modeler-types";

import { ChoicePrompt } from "./prompts";

/**
 * The execution platform a new BPMN model is created for. `"neutral"` scaffolds
 * an engine-neutral (untagged) diagram that opens in Design mode; a concrete
 * {@link Engine} stamps its execution platform and opens in Implement mode.
 */
export type NewModelEngine = Engine | "neutral";

export function newModelEnginePrompt(): ChoicePrompt<NewModelEngine> {
    return {
        id: "newModelEngine",
        placeholder: "Select the execution platform.",
        items: [
            { label: ENGINE_LABEL.c7, value: "c7" },
            { label: ENGINE_LABEL.c8, value: "c8" },
            {
                label: "Engine-neutral",
                description: "No execution platform — opens in Design mode",
                value: "neutral",
            },
        ],
    };
}
