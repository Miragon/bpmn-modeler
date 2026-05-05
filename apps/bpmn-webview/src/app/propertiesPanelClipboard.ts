/**
 * Handles Ctrl/Cmd+A: selects all text in focused inputs; fully intercepts
 * the event for canvas focus and delegates element selection to onSelectAll.
 */
function handleSelectAll(e: KeyboardEvent, el: Element, onSelectAll?: () => void): void {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        e.stopPropagation();
        e.preventDefault();
        el.select();
        return;
    }
    e.stopPropagation();
    e.preventDefault();
    onSelectAll?.();
}

/**
 * Writes the current text selection to the extension-host clipboard.
 */
function handleCopy(writeClipboard: (text: string) => void): void {
    const text = window.getSelection()?.toString() ?? "";
    if (text) writeClipboard(text);
}

/**
 * Reads from the extension-host clipboard and pastes into the target element.
 */
function handlePaste(el: HTMLElement, requestClipboard: () => Promise<string>): void {
    requestClipboard().then((text) => {
        if (text) dispatchPasteOrInsert(el, text);
    });
}

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
 * @param onSelectAll Called when Ctrl+A fires outside a text input (e.g. on the canvas).
 */
export function installContentEditableClipboardPolyfill(
    requestClipboard: () => Promise<string>,
    writeClipboard: (text: string) => void,
    onSelectAll?: () => void,
): void {
    let handled = false;

    document.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
            const el = document.activeElement;
            if (!(el instanceof Element)) return;

            const isMod = e.metaKey || e.ctrlKey;
            if (!isMod) return;

            if (e.key === "a") {
                handleSelectAll(e, el, onSelectAll);
                return;
            }

            if (!(el instanceof HTMLElement)) return;
            if (el.contentEditable !== "true") return;

            if (e.key === "v") {
                handled = true;
                setTimeout(() => {
                    handled = false;
                }, 200);
                e.preventDefault();
                handlePaste(el, requestClipboard);
            }

            if (e.key === "c") {
                handled = true;
                setTimeout(() => {
                    handled = false;
                }, 200);
                handleCopy(writeClipboard);
            }
        },
        true,
    );

    const nativeExecCommand = Document.prototype.execCommand;

    Object.defineProperty(document, "execCommand", {
        value: function (command: string, showUI?: boolean, value?: string): boolean {
            const el = document.activeElement;

            if (el instanceof HTMLElement && el.contentEditable === "true") {
                if (command === "paste") {
                    if (handled) return true;
                    handlePaste(el, requestClipboard);
                    return true;
                }

                if (command === "copy") {
                    if (handled) return true;
                    handleCopy(writeClipboard);
                    return true;
                }
            }

            return nativeExecCommand?.call(document, command, showUI, value) ?? false;
        },
        writable: true,
        configurable: true,
    });
}

/**
 * Dispatches a synthetic `ClipboardEvent("paste")` on the target element.
 * Falls back to `execCommand("insertText")` when no JS handler consumes it.
 *
 * Editors with JS paste handlers (e.g. CodeMirror 6 / FEEL editor) consume
 * the ClipboardEvent themselves; plain contenteditable elements (e.g.
 * diagram-js TextBox) rely on the explicit insertText fallback.
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

    if (!event.defaultPrevented) {
        Document.prototype.execCommand?.call(document, "insertText", false, text);
    }
}
