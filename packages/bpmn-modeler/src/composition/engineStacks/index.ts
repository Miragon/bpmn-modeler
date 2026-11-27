import { isEngine, UnsupportedEngineError, type Engine } from "@miragon/bpmn-modeler-types";
import type { EngineStack } from "./engineStack";

export type { EngineStack } from "./engineStack";

// Dynamic so a page only parses the plugin stack of the engine it opens.
const ENGINE_STACK_LOADERS: Record<Engine, () => Promise<EngineStack>> = {
    c7: async () => (await import("./c7")).c7Stack,
    c8: async () => (await import("./c8")).c8Stack,
};

export async function loadEngineStack(engine: Engine): Promise<EngineStack> {
    if (!isEngine(engine)) {
        throw new UnsupportedEngineError(engine);
    }
    return ENGINE_STACK_LOADERS[engine]();
}
