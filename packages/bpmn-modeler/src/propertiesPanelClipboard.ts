/** @internal */
import { isTextEditingSurface } from "@miragon/bpmn-modeler-types";

export interface TextClipboardCallbacks {
    requestClipboard(): Promise<string>;
    writeClipboard(text: string): void;
}

function handleCopy(writeClipboard: (text: string) => void): void {
    const text = window.getSelection()?.toString() ?? "";
    if (text) writeClipboard(text);
}

function handlePaste(el: HTMLElement, requestClipboard: () => Promise<string>): void {
    requestClipboard().then((text) => {
        if (text) dispatchPasteOrInsert(el, text);
    });
}

const rootRegistry = new Map<HTMLElement, TextClipboardCallbacks>();
let uninstallDocumentHooks: (() => void) | undefined;

// Dedups one physical keystroke against one host execCommand("paste") — a page-level phenomenon,
// so this flag stays module-global across every registered root.
let handled = false;

function markHandled(): void {
    handled = true;
    setTimeout(() => {
        handled = false;
    }, 200);
}

function resolveCallbacks(target: Element | null): TextClipboardCallbacks | undefined {
    let node = target instanceof HTMLElement ? target : null;
    while (node) {
        const callbacks = rootRegistry.get(node);
        if (callbacks) return callbacks;
        node = node.parentElement;
    }
    return undefined;
}

export function installContentEditableClipboardPolyfill(
    roots: readonly HTMLElement[],
    callbacks: TextClipboardCallbacks,
): () => void {
    for (const root of roots) {
        rootRegistry.set(root, callbacks);
    }
    uninstallDocumentHooks ??= installDocumentHooks();

    let disposed = false;
    return () => {
        if (disposed) return;
        disposed = true;
        for (const root of roots) {
            // Ownership check: a stale disposer must not evict a live re-registration of the same root.
            if (rootRegistry.get(root) === callbacks) {
                rootRegistry.delete(root);
            }
        }
        if (rootRegistry.size === 0) {
            uninstallDocumentHooks?.();
            uninstallDocumentHooks = undefined;
        }
    };
}

function installDocumentHooks(): () => void {
    const onClipboardKeydown = (e: KeyboardEvent): void => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement)) return;

        const isMod = e.metaKey || e.ctrlKey;
        if (!isMod) return;
        if (el.contentEditable !== "true") return;
        if (e.key !== "v" && e.key !== "c") return;

        const callbacks = resolveCallbacks(el);
        if (!callbacks) return;

        // Mark before the label exclusion bails: in VS Code one Ctrl+V arrives as keydown *and* a
        // workbench execCommand("paste"). The label module handles the keydown but never sets the
        // flag, so without this the execCommand patch below would paste a second time.
        markHandled();

        // LabelClipboardModule owns keydown clipboard on the direct-editing textbox.
        if (el.closest(".djs-direct-editing-content")) return;

        if (e.key === "v") {
            e.preventDefault();
            handlePaste(el, callbacks.requestClipboard);
        } else {
            handleCopy(callbacks.writeClipboard);
        }
    };

    const onSelectAllKeydown = (e: KeyboardEvent): void => {
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
    };

    const nativeExecCommand = Document.prototype.execCommand;

    const patchedExecCommand = function (
        command: string,
        showUI?: boolean,
        value?: string,
    ): boolean {
        const el = document.activeElement;

        if (el instanceof HTMLElement && el.contentEditable === "true") {
            const callbacks = resolveCallbacks(el);
            if (callbacks) {
                if (command === "paste") {
                    if (handled) return true;
                    handlePaste(el, callbacks.requestClipboard);
                    return true;
                }

                if (command === "copy") {
                    if (handled) return true;
                    handleCopy(callbacks.writeClipboard);
                    return true;
                }
            }
        }

        return nativeExecCommand?.call(document, command, showUI, value) ?? false;
    };

    // Capture copy/paste before direct editing stops propagation; let text editors handle select-all first.
    document.addEventListener("keydown", onClipboardKeydown, true);
    document.addEventListener("keydown", onSelectAllKeydown, false);

    Object.defineProperty(document, "execCommand", {
        value: patchedExecCommand,
        writable: true,
        configurable: true,
    });

    return () => {
        document.removeEventListener("keydown", onClipboardKeydown, true);
        document.removeEventListener("keydown", onSelectAllKeydown, false);

        // Restore native dispatch by removing our own property, but only if a later foreign patch
        // has not replaced it — that patch must survive.
        const descriptor = Object.getOwnPropertyDescriptor(document, "execCommand");
        if (descriptor?.value === patchedExecCommand) {
            delete (document as { execCommand?: unknown }).execCommand;
        }

        handled = false;
    };
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
