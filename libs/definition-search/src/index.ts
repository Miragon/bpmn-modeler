/**
 * bpmn-js DI module that adds a workspace search below the message / signal /
 * error / escalation reference select. Picking a result copies the definition
 * into the current model (or reuses an equal one) and links it, so each model
 * stays self-contained. Results come from the {@link DefinitionSearchPort}.
 */
import "./definitionSearch.css";

import { DefinitionSearchPropertiesProvider } from "./DefinitionSearchPropertiesProvider";
import type { DefinitionSearchPort } from "./DefinitionSearchPort";

export type { DefinitionSearchPort };
export { DEFINITION_SEARCH_KEYS } from "./definitionSearchTexts";

/**
 * @internal Package-internal composition wiring: consumers enable this feature
 *   through the modeler's `capabilities.definitionSearch` port.
 */
export function createDefinitionSearchModule(port: DefinitionSearchPort) {
    return {
        __init__: ["definitionSearchPropertiesProvider"],
        definitionSearchPropertiesProvider: ["type", DefinitionSearchPropertiesProvider],
        definitionSearchPort: ["value", port],
    };
}
