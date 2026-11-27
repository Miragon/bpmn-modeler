import {
    createInlineScriptingModules,
    type InlineScriptingPort,
} from "@miragon/bpmn-modeler-inline-scripting";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/**
 * @experimental Edits inline scripts in the host's editor; the inline-scripting
 * library's helpers write them back on a surface. Only an engine with inline
 * scripts lists it.
 */
export function inlineScripting(port: InlineScriptingPort): BpmnFeature {
    return {
        id: "inlineScripting",
        modules: createInlineScriptingModules(port),
        requires: ["propertiesPanel"],
    };
}
