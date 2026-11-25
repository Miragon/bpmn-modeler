import { type ClipboardOptions, createClipboardModules } from "@miragon/bpmn-modeler-clipboard";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";
import { createClipboardTextPolyfillModule } from "./clipboardTextPolyfillModule";

/**
 * @experimental Routes copy and paste through a host bridge instead of the
 * browser clipboard. Modeler base only: the bridge takes over bpmn-js
 * `copyPaste` and the `nativeCopyPaste` module another feature provides.
 */
export function clipboard({ bridge, text }: ClipboardOptions): BpmnFeature {
    return {
        id: "clipboard",
        modules: [
            ...createClipboardModules({ element: bridge, text }),
            createClipboardTextPolyfillModule(text ?? bridge),
        ],
        requires: ["nativeCopyPaste"],
    };
}

/** The modules a preset registers for its `clipboard` option; none without one. */
export function clipboardModulesOf(options: ClipboardOptions | undefined): unknown[] {
    return options ? [...clipboard(options).modules] : [];
}
