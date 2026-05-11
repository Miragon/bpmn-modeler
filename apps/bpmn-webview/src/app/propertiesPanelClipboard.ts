/**
 * Returns true if `el` is a surface where the user is editing text
 * (`<input>`, `<textarea>`, or any `contenteditable` element).
 *
 * The webview-level keyboard guard uses this predicate to decide whether
 * bpmn-js should be allowed to receive a Ctrl/Cmd+A keystroke: text surfaces
 * own their own selection, so the event must not reach bpmn-js's Keyboard
 * service.
 */
function isTextEditingSurface(el: Element | null): boolean {
    if (el instanceof HTMLInputElement) return true;
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLElement && el.contentEditable === "true") return true;
    return false;
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
 * Installs the webview-level keyboard / clipboard guard.
 *
 * Two responsibilities, both registered as a single document-level capture-phase
 * `keydown` listener:
 *
 * 1. **Ctrl/Cmd+A guard.** When focus is on a text-editing surface
 *    (`<input>`, `<textarea>`, or any contenteditable element), stop the event
 *    from propagating so bpmn-js's `Keyboard` service does not turn it into a
 *    canvas `selectElements` action. The surface's own owner then handles the
 *    keystroke:
 *      - browser native for `<input>` / `<textarea>`,
 *      - `LabelClipboardModule` for the BPMN label overlay,
 *      - CodeMirror 6 for the Camunda 8 FEEL expression editor.
 *    When focus is elsewhere, the handler does nothing — bpmn-js's built-in
 *    Ctrl+A binding selects the canvas.
 *
 * 2. **Ctrl/Cmd+C/V bridge for contenteditable.** VS Code webview iframes lack
 *    clipboard permissions, and bpmn-js's `DirectEditing._handleKey` calls
 *    `stopPropagation()` on every keydown from the label overlay. The
 *    capture-phase listener intercepts the keys early and bridges them through
 *    the extension host. A `document.execCommand` polyfill covers non-keyboard
 *    triggers (e.g. VS Code command palette); a dedup flag prevents double
 *    handling when both layers fire.
 *
 * @param requestClipboard Async callback that reads clipboard text via the extension host.
 * @param writeClipboard Callback that writes text to the extension host clipboard.
 */
export function installContentEditableClipboardPolyfill(
    requestClipboard: () => Promise<string>,
    writeClipboard: (text: string) => void,
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
                if (isTextEditingSurface(el)) {
                    e.stopPropagation();
                }
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
