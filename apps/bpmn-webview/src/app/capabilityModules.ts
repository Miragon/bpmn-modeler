import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";
import { createCodeLinkModule } from "@miragon/bpmn-modeler-code-link";
import { createInlineScriptingModules } from "@miragon/bpmn-modeler-inline-scripting";
import type { Engine } from "@miragon/bpmn-modeler-types";
import type { ModelerCapabilities } from "./capabilities";

/**
 * Builds the DI modules for the capability-gated features. A capability that is
 * absent contributes no module, so its providers are never registered and its
 * UI cannot appear — the browser-side mirror of the host-capability-port
 * pattern. Scripting is additionally C7-only (the C8 modeler leaves it
 * unregistered), so its port alone is not enough on C8.
 *
 * Split out of {@link BpmnModeler} so the gating is unit-testable without
 * dragging in camunda-bpmn-js.
 */
export function capabilityModules(engine: Engine, capabilities?: ModelerCapabilities): any[] {
    const modules: any[] = [];
    if (capabilities?.modelNavigation) {
        modules.push(createModelNavigationModule(capabilities.modelNavigation));
    }
    if (capabilities?.codeLink) {
        modules.push(createCodeLinkModule(capabilities.codeLink));
    }
    if (engine === "c7" && capabilities?.scripting) {
        modules.push(...createInlineScriptingModules(capabilities.scripting));
    }
    return modules;
}
