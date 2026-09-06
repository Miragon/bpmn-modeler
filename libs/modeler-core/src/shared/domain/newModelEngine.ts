import { ENGINE_LABEL, Engine } from "@miragon/bpmn-modeler-types";

/**
 * The execution platform a new BPMN model is created for. `"neutral"` scaffolds
 * an engine-neutral (untagged) diagram that opens in Design mode; a concrete
 * {@link Engine} stamps its execution platform and opens in Implement mode.
 */
export type NewModelEngine = Engine | "neutral";

/** A choice offered by the new-model picker (VS Code QuickPick / bridge picker). */
export interface NewModelEngineChoice {
    id: NewModelEngine;
    label: string;
    description?: string;
}

/**
 * The new-model picker options, in display order. Camunda 7/8 stamp their
 * execution platform; the engine-neutral choice opens in Design with no platform.
 */
export const NEW_MODEL_ENGINE_CHOICES: readonly NewModelEngineChoice[] = [
    { id: "c7", label: ENGINE_LABEL.c7 },
    { id: "c8", label: ENGINE_LABEL.c8 },
    {
        id: "neutral",
        label: "Engine-neutral",
        description: "No execution platform — opens in Design mode",
    },
];
