import { BridgedClipboardModule, type ClipboardBridge } from "./BridgedClipboardModule";
import { LabelClipboardModule } from "./LabelClipboardModule";

/**
 * Builds the bpmn-js DI modules that override the native clipboard with a host
 * bridge, for webviews that cannot reach the system clipboard directly (#1374).
 * Omitting these modules entirely leaves bpmn-js's `NativeCopyPaste` in charge
 * — the native default — so this factory is only the override path.
 *
 * Two DI channels are bound so element and label-text clipboards stay separate.
 * The public single-bridge API ({@link ClipboardBridge} for both) maps directly:
 * `text` defaults to `element`, while a host with two protocol channels (VS Code)
 * supplies both.
 *
 * @param bridges.element Bridge for diagram-element copy/paste.
 * @param bridges.text Bridge for label-text copy/paste; defaults to `element`.
 */
export function createClipboardModules(bridges: {
    element: ClipboardBridge;
    text?: ClipboardBridge;
}): unknown[] {
    return [
        BridgedClipboardModule,
        LabelClipboardModule,
        {
            elementClipboardBridge: ["value", bridges.element],
            textClipboardBridge: ["value", bridges.text ?? bridges.element],
        },
    ];
}
