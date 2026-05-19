/**
 * bpmn-js DI module that intercepts element copy/paste operations and routes
 * them through the VS Code extension host clipboard.
 *
 * Replaces the broken `NativeCopyPaste` layer (which activates in VS Code
 * webviews but cannot actually read/write the clipboard due to missing
 * iframe permissions) with extension-host-mediated clipboard access.
 *
 * Uses proper didi DI value injection (`elementClipboardBridge`) instead of
 * `config.*` to ensure the bridge is always available when the module loads.
 */
import { createReviver } from "bpmn-js-native-copy-paste/lib/PasteUtil.js";

/**
 * Bridge interface for clipboard operations routed through the VS Code
 * extension host.
 */
export interface ClipboardBridge {
    // Reads clipboard text from the extension host.
    requestClipboard: () => Promise<string>;
    // Writes text to the system clipboard via the extension host.
    writeClipboard: (text: string) => void;
}

const CLIP_PREFIX = "bpmn-js-clip----";

/**
 * Intercepts `copyPaste.elementsCopied` and `copyPaste.pasteElements` at
 * priority 2051 (above NativeCopyPaste's 2050) to route element clipboard
 * operations through the extension host.
 *
 * Disables `NativeCopyPaste` on construction so no broken
 * `navigator.clipboard` calls are made.
 *
 * Re-focuses the canvas SVG after keyboard-triggered selection changes
 * (e.g. Cmd+A) to prevent subsequent Cmd+C from silently failing when the
 * properties panel steals focus.
 */
class VsCodeClipboard {
    static $inject = [
        "elementClipboardBridge",
        "eventBus",
        "copyPaste",
        "moddle",
        "nativeCopyPaste",
        "canvas",
    ];

    constructor(
        bridge: ClipboardBridge,
        eventBus: any,
        copyPaste: any,
        moddle: any,
        nativeCopyPaste: any,
        canvas: any,
    ) {
        // Disable the broken NativeCopyPaste middle layer.
        nativeCopyPaste.toggle(false);

        const { requestClipboard, writeClipboard } = bridge;

        // Pending serialized BPMN data waiting to be written to the clipboard
        // via the next `copy` event. Set by the copy interceptor, consumed by
        // the capture-phase `copy` event handler.
        let pendingClipData: string | null = null;

        // ── Capture-phase copy event handler ─────────────────────────────
        // VS Code's webview clipboard handler listens for `copy` events and
        // forwards `clipboardData` to the extension host. By hijacking the
        // event in capture phase (before VS Code's handler sees it), we
        // inject our serialized BPMN data synchronously — eliminating the
        // race condition where VS Code's handler would otherwise copy the
        // DOM text selection (e.g. a stale line break after Cmd+A).
        document.addEventListener(
            "copy",
            (e: ClipboardEvent) => {
                if (pendingClipData) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    e.clipboardData?.setData("text/plain", pendingClipData);
                    pendingClipData = null;
                }
            },
            true,
        );

        // ── Copy interceptor ─────────────────────────────────────────────
        eventBus.on("copyPaste.elementsCopied", 2051, (context: any) => {
            const serialized = CLIP_PREFIX + JSON.stringify(context.tree);

            // Store for the synchronous copy-event path.
            pendingClipData = serialized;

            /**
             * Also write via the async extension host postMessage path as a
             * backup (handles cases where no copy event fires).
             */
            writeClipboard(serialized);

            context.hints = context.hints || {};
            context.hints.clip = false;
        });

        // ── Paste interceptor ────────────────────────────────────────────
        eventBus.on("copyPaste.pasteElements", 2051, (context: any) => {
            if (context.tree) {
                return;
            }

            // Snapshot context NOW, before `return false` sets `defaultPrevented`
            // on the same object.
            const contextSnapshot = { ...context };

            requestClipboard().then((text) => {
                if (!text || !text.startsWith(CLIP_PREFIX)) {
                    return;
                }

                try {
                    const json = text.substring(CLIP_PREFIX.length);
                    const tree = JSON.parse(json, createReviver(moddle));
                    copyPaste.paste({ ...contextSnapshot, tree });
                } catch (error) {
                    console.error("Failed to deserialise clipboard content", error);
                }
            });

            return false;
        });

        // ── Focus fix ────────────────────────────────────────────────────
        // Re-focus the canvas SVG after selection changes. diagram-js
        // Keyboard binds to the SVG and Canvas.focus() is only called on
        // element.mousedown. After keyboard-triggered selection changes
        // (e.g. Cmd+A), the properties panel re-render can steal focus,
        // causing subsequent Cmd+C to silently fail.
        eventBus.on("selection.changed", () => {
            requestAnimationFrame(() => {
                const active = document.activeElement;
                if (
                    active instanceof HTMLInputElement ||
                    active instanceof HTMLTextAreaElement ||
                    (active as HTMLElement)?.isContentEditable === true
                ) {
                    return;
                }
                canvas.focus();
            });
        });
    }
}

export const VsCodeClipboardModule = {
    __init__: ["vsCodeClipboard"],
    vsCodeClipboard: ["type", VsCodeClipboard],
};
