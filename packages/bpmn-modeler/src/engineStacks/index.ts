import { UnsupportedEngineError, type Engine } from "@miragon/bpmn-modeler-types";
import type { EngineStack } from "./engineStack";

export type { EngineStack } from "./engineStack";

// Dynamic so a page only parses the camunda-bpmn-js stack of the engine it opens.
export async function loadEngineStack(engine: Engine): Promise<EngineStack> {
    switch (engine) {
        case "c7":
            return (await import("./c7")).c7Stack;
        case "c8":
            return (await import("./c8")).c8Stack;
        default:
            throw new UnsupportedEngineError(engine);
    }
}
