import { type ClipboardBridge, createClipboardModules } from "@miragon/bpmn-modeler-clipboard";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";
import { createClipboardTextPolyfillModule } from "./clipboardTextPolyfillModule";

export interface ClipboardFeatureOptions {
    /** Diagram-element copy and paste; also the text bridge when `text` is omitted. */
    readonly bridge: ClipboardBridge;
    /** Labels and contenteditables (the FEEL editors). */
    readonly text?: ClipboardBridge;
}

/**
 * @experimental Routes copy and paste through a host bridge instead of the
 * browser clipboard. Modeler base only: the bridge takes over bpmn-js
 * `copyPaste` and the `nativeCopyPaste` module another feature provides.
 */
export function clipboard({ bridge, text }: ClipboardFeatureOptions): BpmnFeature {
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
export function clipboardModulesOf(options: ClipboardFeatureOptions | undefined): unknown[] {
    return options ? [...clipboard(options).modules] : [];
}
