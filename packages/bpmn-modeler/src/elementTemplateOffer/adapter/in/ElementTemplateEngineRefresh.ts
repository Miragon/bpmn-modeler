import {
    ExecutionPlatformAttributes,
    type ExecutionPlatformDefinitions,
} from "@miragon/bpmn-modeler-types/domain";

import { deriveEngines, type Engines } from "../../domain/templateEngines";

// Below every default import.done listener and bpmn-js-bpmnlint's 500: the facade refreshed
// the engines after the import resolved. Independent of the transaction-boundary re-show.
const TEMPLATE_ENGINE_REFRESH_PRIORITY = 250;

interface ImportDoneEventBus {
    on(
        event: "import.done",
        priority: number,
        listener: (event: { error?: unknown }) => void,
    ): void;
}

interface Bpmnjs {
    getDefinitions(): ExecutionPlatformDefinitions | undefined;
}

interface ElementTemplatesEngines {
    setEngines(engines: Engines): void;
}

interface OptionalInjector {
    get<T>(name: string, strict: false): T | null;
}

/**
 * Gates element templates on the engine version each imported diagram declares;
 * a diagram that declares none clears the previous version. bpmn-js fires
 * `import.done` on a failed import too, which keeps the previous diagram.
 */
export class ElementTemplateEngineRefresh {
    static $inject = ["eventBus", "bpmnjs", "injector"];

    constructor(eventBus: ImportDoneEventBus, bpmnjs: Bpmnjs, injector: OptionalInjector) {
        eventBus.on("import.done", TEMPLATE_ENGINE_REFRESH_PRIORITY, (event) => {
            if (event.error) {
                return;
            }
            // Looked up here, not at construction, so the templates service is built when it was before.
            const elementTemplates = injector.get<ElementTemplatesEngines>(
                "elementTemplates",
                false,
            );
            const definitions = bpmnjs.getDefinitions();
            elementTemplates?.setEngines(
                deriveEngines(
                    definitions ? new ExecutionPlatformAttributes(definitions).read() : {},
                ),
            );
        });
    }
}
