import { type CodeLinkPort, createCodeLinkModule } from "@miragon/bpmn-modeler-code-link";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/**
 * @experimental Goes to a task's implementation through the host; the code-link
 * library's helper hands it the host's status pushes.
 */
export function codeLink(port: CodeLinkPort): BpmnFeature {
    return { id: "codeLink", modules: [createCodeLinkModule(port)] };
}
