/**
 * Polyfills clipboard operations for all `contenteditable` elements in
 * VS Code webviews.
 *
 * Uses two complementary mechanisms:
 * 1. A `keydown` capture-phase listener that intercepts Cmd/Ctrl+C/V before
 *    any element handler can call `stopPropagation()` (fixes the canvas label
 *    editor whose DirectEditing module stops propagation on every keydown).
 * 2. A `document.execCommand` polyfill as fallback for non-keyboard clipboard
 *    triggers (e.g. VS Code command palette).
 *
 * A dedup flag prevents double-handling when both layers fire.
 *
 * @param requestClipboard Async callback that reads clipboard text via the extension host.
 * @param writeClipboard Callback that writes text to the extension host clipboard.
 */
export function installContentEditableClipboardPolyfill(
    requestClipboard: () => Promise<string>,
    writeClipboard: (text: string) => void,
): void {
    let handled = false;

    // ── Primary: capture-phase keydown listener ─────────────────────────
    document.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
            const el = document.activeElement;
            if (
                !(el instanceof HTMLElement) ||
                el.contentEditable !== "true"
            ) {
                return;
            }

            const isMod = e.metaKey || e.ctrlKey;
            if (!isMod) return;

            if (e.key === "v") {
                handled = true;
                setTimeout(() => {
                    handled = false;
                }, 200);
                e.preventDefault();

                requestClipboard().then((text) => {
                    if (text) {
                        dispatchPasteOrInsert(el, text);
                    }
                });
            }

            if (e.key === "c") {
                handled = true;
                setTimeout(() => {
                    handled = false;
                }, 200);
                const text = window.getSelection()?.toString() ?? "";
                if (text) {
                    writeClipboard(text);
                }
            }
        },
        true, // capture phase — fires before DirectEditing's stopPropagation()
    );

    // ── Secondary: execCommand polyfill (fallback) ──────────────────────
    document.execCommand = function (
        command: string,
        showUI?: boolean,
        value?: string,
    ): boolean {
        const el = document.activeElement;

        if (
            el instanceof HTMLElement &&
            el.contentEditable === "true"
        ) {
            if (command === "paste") {
                if (handled) return true;
                requestClipboard().then((text) => {
                    if (text) {
                        dispatchPasteOrInsert(el, text);
                    }
                });
                return true;
            }

            if (command === "copy") {
                if (handled) return true;
                const text = window.getSelection()?.toString() ?? "";
                if (text) {
                    writeClipboard(text);
                }
                return true;
            }
        }

        return Document.prototype.execCommand.call(
            document,
            command,
            showUI,
            value,
        );
    };
}

/**
 * Dispatches a synthetic `ClipboardEvent("paste")` on the target element.
 * If no JavaScript handler consumes the event (i.e. `defaultPrevented` remains
 * false), falls back to inserting the text directly via the native
 * `execCommand("insertText")`.
 *
 * This two-step approach is necessary because:
 * - Editors with JS paste handlers (e.g. CodeMirror 6 / FEEL editor) consume
 *   the ClipboardEvent and handle insertion themselves.
 * - Plain contenteditable elements (e.g. diagram-js TextBox / canvas label
 *   editor) rely on the browser's native paste behavior, which does not fire
 *   for synthetic events — so we must insert the text explicitly.
 *
 * @param el The target contenteditable element.
 * @param text The plain text to paste.
 */
function dispatchPasteOrInsert(el: HTMLElement, text: string): void {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
    });
    el.dispatchEvent(event);

    // If no JS handler consumed the paste event, insert text directly.
    // This covers plain contenteditable elements like the canvas label editor
    // (diagram-js TextBox) which have no JS paste handler.
    if (!event.defaultPrevented) {
        Document.prototype.execCommand.call(document, "insertText", false, text);
    }
}
