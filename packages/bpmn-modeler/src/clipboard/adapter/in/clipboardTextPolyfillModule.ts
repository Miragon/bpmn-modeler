import { installForDiagramLifetime, type LifetimeEventBus } from "@miragon/bpmn-modeler-browser";
import type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";

import { SURFACE_ROOTS } from "../../../kernel/domain/kernelNames";
import type { SurfaceRoots } from "../../../kernel/port/kernelServices";
import { installContentEditableClipboardPolyfill } from "./propertiesPanelClipboard";

/**
 * Bridges text copy and paste in the surface's contenteditables (the FEEL
 * editors, which sit outside bpmn-js DI) through the host's text clipboard.
 */
export function createClipboardTextPolyfillModule(textBridge: ClipboardBridge) {
    function clipboardTextPolyfill(eventBus: LifetimeEventBus, roots: SurfaceRoots): object {
        installForDiagramLifetime(eventBus, () =>
            // Wrapped to keep the bridge's `this`.
            installContentEditableClipboardPolyfill(roots, {
                requestClipboard: () => textBridge.requestClipboard(),
                writeClipboard: (text) => {
                    void textBridge.writeClipboard(text);
                },
            }),
        );
        return {};
    }
    clipboardTextPolyfill.$inject = ["eventBus", SURFACE_ROOTS];
    return {
        __init__: ["clipboardTextPolyfill"],
        clipboardTextPolyfill: ["factory", clipboardTextPolyfill],
    };
}
