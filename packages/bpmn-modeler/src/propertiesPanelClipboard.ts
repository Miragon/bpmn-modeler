/**
 * @internal Host-adapter surface — routes the panel's plain-text copy/paste
 * through the extension-host clipboard bridge. Not part of the public API;
 * folded behind the `clipboard` option's bridge.
 */
import { isTextEditingSurface } from "@miragon/bpmn-modeler-types";

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
 * Registers two `keydown` listeners on `document`, each with a deliberately
 * chosen phase:
 *
 * 1. **Capture phase — Ctrl/Cmd+C/V bridge for contenteditable.** VS Code
 *    webview iframes lack clipboard permissions, and bpmn-js's
 *    `DirectEditing._handleKey` calls `stopPropagation()` on every keydown
 *    from the label overlay. Capture-phase fires before that stopPropagation,
 *    so the bridge can intercept the keys and route them through the
 *    extension host. A `document.execCommand` polyfill covers non-keyboard
 *    triggers (VS Code command palette); a dedup flag prevents double
 *    handling when both layers fire.
 *
 * 2. **Bubble phase — Ctrl/Cmd+A guard.** Each text surface owns its own
 *    Ctrl+A: browser native for `<input>`/`<textarea>`, `LabelClipboardModule`
 *    for the BPMN label overlay, CodeMirror 6 for the Camunda 8 FEEL editor.
 *    Bubble-phase lets those owners run first (capture + target phases).
 *    Then, at `document` during bubble, we always call `stopPropagation()`
 *    so the event never reaches `window`. This is what blocks the Theia
 *    standalone host from forwarding the keystroke to its outer shell:
 *    Theia's webview pre-bootstrap (`@theia/plugin-ext/.../pre/main.js`)
 *    listens on the inner iframe's `window` in bubble phase and posts the
 *    event unconditionally (it does NOT gate on `defaultPrevented`). Without
 *    `stopPropagation` here the outer shell receives a synthetic Ctrl+A and
 *    runs `CommonCommands.SELECT_ALL` = `document.execCommand('selectAll')`
 *    against the whole Theia shell, visibly selecting the file explorer,
 *    toolbar, etc. `stopPropagation` (not `stopImmediatePropagation`) leaves
 *    bpmn-js's `Keyboard` listener intact because it sits on the same node.
 *    For text surfaces we additionally call `stopImmediatePropagation()` to
 *    block bpmn-js (same-node, same-phase, registered after us).
 *
 * @param requestClipboard Async callback that reads clipboard text via the extension host.
 * @param writeClipboard Callback that writes text to the extension host clipboard.
 */
let polyfillInstalled = false;

export function installContentEditableClipboardPolyfill(
    requestClipboard: () => Promise<string>,
    writeClipboard: (text: string) => void,
): void {
    // Page-global by nature: the two document listeners and the execCommand
    // monkey-patch below act on `document`, so a second install would stack
    // duplicate handlers and double-wrap execCommand. This stays owned by the
    // single-instance bootstrap (not the per-instance facade); the guard makes
    // a repeat call a no-op should a multi-instance consumer wire it twice.
    if (polyfillInstalled) {
        return;
    }
    polyfillInstalled = true;

    let handled = false;

    document.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
            const el = document.activeElement;
            if (!(el instanceof HTMLElement)) return;

            const isMod = e.metaKey || e.ctrlKey;
            if (!isMod) return;
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

    document.addEventListener(
        "keydown",
        (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            if (e.key !== "a") return;

            // Stop the bubble before it reaches `window`. Theia's webview
            // pre-bootstrap listens there and forwards keydowns to the
            // outer shell unconditionally (it does NOT gate on
            // defaultPrevented), which would otherwise run a global
            // SELECT_ALL against the Theia chrome. Same-node listeners
            // (bpmn-js's Keyboard) still fire because stopPropagation
            // doesn't affect them.
            e.stopPropagation();

            const el = document.activeElement;
            if (!isTextEditingSurface(el)) {
                // Canvas / no text surface: let bpmn-js handle selectElements.
                return;
            }

            // Block bpmn-js's Keyboard listener (same node, same phase,
            // registered after us). stopPropagation alone would leave it
            // running because it doesn't affect same-node listeners.
            e.stopImmediatePropagation();

            /**
             * Contenteditable surfaces (BPMN label, FEEL editor) own their
             * own selection via scoped handlers run in earlier phases.
             * For `<input>`/`<textarea>`, the native Ctrl+A default action
             * is unreliable inside webview iframes, so we select explicitly.
             */
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.select();
            }
        },
        false,
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
