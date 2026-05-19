/**
 * bpmn-js DI module that polyfills clipboard operations for contenteditable
 * label overlays inside the BPMN webview.
 *
 * diagram-js's `DirectEditing._handleKey` calls `stopPropagation()` on every
 * keydown from the contenteditable overlay, preventing native clipboard
 * handling.  Additionally, VS Code webview iframes lack clipboard permissions.
 *
 * This module attaches a capture-phase keydown listener to the label element
 * only while direct editing is active, routing copy/paste/select-all through
 * the extension host.
 *
 * Uses proper didi DI value injection (`textClipboardBridge`) instead of
 * `config.*` to ensure the bridge is always available when the module loads.
 */
import { ClipboardBridge } from "./VsCodeClipboardModule";

/**
 * Dispatches a synthetic `ClipboardEvent("paste")` with the given text.
 * If no JS handler consumes it (plain contenteditable), falls back to
 * the native `insertText` command.
 *
 * @param text The text to paste into the currently focused element.
 */
function dispatchPasteOrInsert(text: string): void {
    const target = document.activeElement;
    if (!target) return;

    const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: new DataTransfer(),
    });
    event.clipboardData!.setData("text/plain", text);

    const consumed = !target.dispatchEvent(event);
    if (!consumed) {
        // No handler called preventDefault — insert text directly.
        document.execCommand("insertText", false, text);
    }
}

/**
 * Manages clipboard operations for contenteditable label overlays during
 * direct editing sessions.
 *
 * Listens to `directEditing.activate` / `directEditing.deactivate` events
 * and attaches/detaches a capture-phase keydown handler on the label element.
 */
class LabelClipboard {
    static $inject = ["textClipboardBridge", "eventBus", "directEditing"];

    // Reference to the currently attached keydown handler, for cleanup.
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    // The contenteditable element the handler is currently attached to.
    private activeElement: HTMLElement | null = null;

    constructor(bridge: ClipboardBridge, eventBus: any, directEditing: any) {
        console.debug("[LabelClipboard] Module initialized");

        const { requestClipboard, writeClipboard } = bridge;

        eventBus.on("directEditing.activate", () => {
            const content: HTMLElement | undefined = directEditing._textbox?.content;
            if (!content) {
                return;
            }

            this.keydownHandler = (e: KeyboardEvent) => {
                const meta = e.metaKey || e.ctrlKey;
                if (!meta) return;

                if (e.key === "c") {
                    // ── Copy ─────────────────────────────────────────────
                    const selection = window.getSelection();
                    const text = selection?.toString() ?? "";
                    if (text) {
                        writeClipboard(text);
                    }
                } else if (e.key === "v") {
                    // ── Paste ────────────────────────────────────────────
                    e.preventDefault();
                    requestClipboard().then((text) => {
                        if (text) {
                            dispatchPasteOrInsert(text);
                        }
                    });
                } else if (e.key === "a") {
                    // ── Select All ───────────────────────────────────────
                    e.preventDefault();
                    const selection = window.getSelection();
                    if (selection) {
                        const range = document.createRange();
                        range.selectNodeContents(content);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            };

            this.activeElement = content;
            content.addEventListener("keydown", this.keydownHandler, true);
        });

        eventBus.on("directEditing.deactivate", () => {
            if (this.activeElement && this.keydownHandler) {
                this.activeElement.removeEventListener("keydown", this.keydownHandler, true);
            }
            this.keydownHandler = null;
            this.activeElement = null;
        });
    }
}

export const LabelClipboardModule = {
    __init__: ["labelClipboard"],
    labelClipboard: ["type", LabelClipboard],
};
