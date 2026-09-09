/** @internal */
import { isTextEditingSurface } from "@miragon/bpmn-modeler-types";

function handleCopy(writeClipboard: (text: string) => void): void {
    const text = window.getSelection()?.toString() ?? "";
    if (text) writeClipboard(text);
}

function handlePaste(el: HTMLElement, requestClipboard: () => Promise<string>): void {
    requestClipboard().then((text) => {
        if (text) dispatchPasteOrInsert(el, text);
    });
}

// Capture copy/paste before direct editing stops propagation; let text editors handle select-all first.
let polyfillInstalled = false;

export function installContentEditableClipboardPolyfill(
    requestClipboard: () => Promise<string>,
    writeClipboard: (text: string) => void,
): void {
    // Document listeners and the execCommand patch are page-global; repeated installs would duplicate handling.
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

            // Theia forwards window keydowns even when defaultPrevented, triggering select-all in the outer shell.
            e.stopPropagation();

            const el = document.activeElement;
            if (!isTextEditingSurface(el)) {
                return;
            }

            // Same-node bpmn-js listeners still run after stopPropagation, so text surfaces need this stronger stop.
            e.stopImmediatePropagation();

            // Native select-all is unreliable for input/textarea in webviews; contenteditables have their own handlers.
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

// Synthetic paste has no native insertion default, so unhandled contenteditables need insertText.
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
