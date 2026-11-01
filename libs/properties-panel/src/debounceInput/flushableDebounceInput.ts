import {
    createFlushableDebounceInput,
    type FlushableDebounceInput,
} from "@miragon/bpmn-modeler-types";

/** The delay of the `@bpmn-io/properties-panel` default this service replaces. */
const PANEL_INPUT_DEBOUNCE_MS = 600;

function debounceInputFactory(): FlushableDebounceInput {
    return createFlushableDebounceInput(PANEL_INPUT_DEBOUNCE_MS);
}

/** Registers the service under the library's `debounceInput` name, once per modeler. */
export const FlushableDebounceInputModule = {
    debounceInput: ["factory", debounceInputFactory],
};
