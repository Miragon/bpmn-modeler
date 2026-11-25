import type { ClipboardBridge } from "./BridgedClipboardModule";

/**
 * [B] Clipboard override. Default (option omitted) is the native browser
 * clipboard. A sandboxed host that cannot reach the system clipboard from the
 * webview supplies a {@link ClipboardBridge} to route copy/paste through its
 * extension host.
 */
export interface ClipboardOptions {
    /** Bridge for diagram-element copy/paste; also the default for `text`. */
    bridge: ClipboardBridge;
    /**
     * Optional separate bridge for text surfaces (labels + the
     * contenteditable/FEEL polyfill). Defaults to `bridge`. A host with two
     * protocol channels (VS Code) supplies both; a single-bridge consumer omits
     * it and both surfaces share `bridge`.
     */
    text?: ClipboardBridge;
}
