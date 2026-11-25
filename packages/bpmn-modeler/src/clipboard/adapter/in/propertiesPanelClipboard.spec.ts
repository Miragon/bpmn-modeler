import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { installContentEditableClipboardPolyfill } from "./propertiesPanelClipboard";

function makeBridge() {
    return {
        requestClipboard: vi.fn<() => Promise<string>>().mockResolvedValue(""),
        writeClipboard: vi.fn<(text: string) => void>(),
    };
}

type Bridge = ReturnType<typeof makeBridge>;

/**
 * Bubble-phase spy that stands in for bpmn-js's `Keyboard` service: if the
 * guard correctly stops propagation, this never fires; if propagation leaks
 * through, this records the keystroke as bpmn-js would have seen it.
 */
const bpmnJsKeyboardSpy = vi.fn<(e: KeyboardEvent) => void>();
const onBpmnJsKeydown = (e: KeyboardEvent): void => bpmnJsKeyboardSpy(e);

/**
 * Bubble-phase spy on `window` that stands in for Theia's webview
 * pre-bootstrap forwarder: it fires only if the Ctrl+A guard failed to stop
 * the bubble at `document`, for *every* surface, canvas included.
 */
const theiaForwarderSpy = vi.fn<(e: KeyboardEvent) => void>();
const onTheiaKeydown = (e: KeyboardEvent): void => theiaForwarderSpy(e);

let disposers: Array<() => void>;
let nativeExecCommandSpy: Mock;

// jsdom ships no execCommand, so define a stub the install captures as its native delegate.
const originalExecCommand = Object.getOwnPropertyDescriptor(Document.prototype, "execCommand");

// The guard is added during install; these must register *after* it so the
// guard's stopImmediatePropagation can suppress the bpmn-js spy.
function addGuardSpies(): void {
    document.addEventListener("keydown", onBpmnJsKeydown);
    window.addEventListener("keydown", onTheiaKeydown);
}

function removeGuardSpies(): void {
    document.removeEventListener("keydown", onBpmnJsKeydown);
    window.removeEventListener("keydown", onTheiaKeydown);
}

function install(roots: HTMLElement[], bridge: Bridge): () => void {
    const dispose = installContentEditableClipboardPolyfill(roots, bridge);
    disposers.push(dispose);
    return dispose;
}

function makeRoot(): HTMLElement {
    const root = document.createElement("div");
    document.body.appendChild(root);
    return root;
}

function focusedInput(parent: HTMLElement = document.body): HTMLInputElement {
    const el = document.createElement("input");
    parent.appendChild(el);
    el.focus();
    return el;
}

function focusedTextarea(parent: HTMLElement = document.body): HTMLTextAreaElement {
    const el = document.createElement("textarea");
    parent.appendChild(el);
    el.focus();
    return el;
}

function focusedEditor(parent: HTMLElement = document.body, className?: string): HTMLDivElement {
    const el = document.createElement("div");
    el.contentEditable = "true";
    el.tabIndex = -1;
    if (className) el.className = className;
    parent.appendChild(el);
    el.focus();
    return el;
}

function focusedDiv(parent: HTMLElement = document.body): HTMLDivElement {
    const el = document.createElement("div");
    el.tabIndex = 0;
    parent.appendChild(el);
    el.focus();
    return el;
}

function ctrl(key: string): KeyboardEvent {
    return new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true });
}

beforeEach(() => {
    vi.useFakeTimers();
    disposers = [];
    bpmnJsKeyboardSpy.mockReset();
    theiaForwarderSpy.mockReset();
    nativeExecCommandSpy = vi.fn().mockReturnValue(false);
    Object.defineProperty(Document.prototype, "execCommand", {
        value: nativeExecCommandSpy,
        writable: true,
        configurable: true,
    });
});

afterEach(() => {
    // Dispose first so the polyfill removes its own document.execCommand before we restore the prototype.
    for (const dispose of disposers.splice(0)) dispose();
    vi.runAllTimers();
    removeGuardSpies();
    if (originalExecCommand) {
        Object.defineProperty(Document.prototype, "execCommand", originalExecCommand);
    } else {
        delete (Document.prototype as { execCommand?: unknown }).execCommand;
    }
    vi.useRealTimers();
    document.body.innerHTML = "";
});

describe("Ctrl+A guard: text-editing surfaces own their selection", () => {
    beforeEach(() => {
        install([makeRoot()], makeBridge());
        addGuardSpies();
    });

    it("does not let Ctrl+A in an <input> reach bpmn-js", () => {
        focusedInput().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).not.toHaveBeenCalled();
    });

    it("does not let Ctrl+A in a <textarea> reach bpmn-js", () => {
        focusedTextarea().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).not.toHaveBeenCalled();
    });

    it("does not let Ctrl+A in a contenteditable reach bpmn-js", () => {
        focusedEditor().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).not.toHaveBeenCalled();
    });

    it("lets Ctrl+A on a non-text element propagate so bpmn-js can select the canvas", () => {
        focusedDiv().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).toHaveBeenCalledTimes(1);
    });
});

describe("Ctrl+A guard: block the Theia outer-shell SELECT_ALL forward", () => {
    beforeEach(() => {
        install([makeRoot()], makeBridge());
        addGuardSpies();
    });

    it("stops Ctrl+A on a non-text element before it reaches `window`", () => {
        focusedDiv().dispatchEvent(ctrl("a"));
        expect(theiaForwarderSpy).not.toHaveBeenCalled();
    });

    it("stops Ctrl+A in an <input> before it reaches `window`", () => {
        focusedInput().dispatchEvent(ctrl("a"));
        expect(theiaForwarderSpy).not.toHaveBeenCalled();
    });

    it("fires for a text surface outside any registered root (guard stays global)", () => {
        // The guard is deliberately not root-scoped: every surface while ≥ 1 instance is alive.
        focusedInput().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).not.toHaveBeenCalled();
        expect(theiaForwarderSpy).not.toHaveBeenCalled();
    });
});

describe("copy and paste inside a registered root", () => {
    let root: HTMLElement;
    let bridge: Bridge;

    beforeEach(() => {
        root = makeRoot();
        bridge = makeBridge();
        install([root], bridge);
    });

    it("Ctrl+V pastes from the host clipboard into a contenteditable in the root", () => {
        focusedEditor(root).dispatchEvent(ctrl("v"));
        expect(bridge.requestClipboard).toHaveBeenCalledTimes(1);
    });

    it("Ctrl+C copies the selected text to the host clipboard", () => {
        vi.spyOn(window, "getSelection").mockReturnValue({
            toString: () => "some expression",
        } as unknown as Selection);
        focusedEditor(root).dispatchEvent(ctrl("c"));
        expect(bridge.writeClipboard).toHaveBeenCalledWith("some expression");
    });

    it("paste does nothing when a plain element is focused", () => {
        focusedDiv(root).dispatchEvent(ctrl("v"));
        expect(bridge.requestClipboard).not.toHaveBeenCalled();
    });

    it("serves a command-palette paste on a contenteditable in the root", () => {
        focusedEditor(root);
        expect(document.execCommand("paste")).toBe(true);
        expect(bridge.requestClipboard).toHaveBeenCalledTimes(1);
    });

    it("pastes only once when keyboard and command palette both fire", () => {
        const editor = focusedEditor(root);
        editor.dispatchEvent(ctrl("v"));
        document.execCommand("paste");
        expect(bridge.requestClipboard).toHaveBeenCalledTimes(1);
    });
});

describe("root scoping", () => {
    it("ignores a contenteditable outside every registered root", () => {
        const bridge = makeBridge();
        install([makeRoot()], bridge);

        const outsider = focusedEditor(document.body);
        const event = ctrl("v");
        outsider.dispatchEvent(event);

        expect(bridge.requestClipboard).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it("delegates execCommand to native for a contenteditable outside every root", () => {
        install([makeRoot()], makeBridge());

        focusedEditor(document.body);
        document.execCommand("paste");

        expect(nativeExecCommandSpy).toHaveBeenCalledWith("paste", undefined, undefined);
    });
});

describe("multiple instances route to their own bridge", () => {
    let rootA: HTMLElement;
    let rootB: HTMLElement;
    let bridgeA: Bridge;
    let bridgeB: Bridge;

    beforeEach(() => {
        rootA = makeRoot();
        rootB = makeRoot();
        bridgeA = makeBridge();
        bridgeB = makeBridge();
        install([rootA], bridgeA);
        install([rootB], bridgeB);
    });

    it("Ctrl+V in root A hits only bridge A", () => {
        focusedEditor(rootA).dispatchEvent(ctrl("v"));
        expect(bridgeA.requestClipboard).toHaveBeenCalledTimes(1);
        expect(bridgeB.requestClipboard).not.toHaveBeenCalled();
    });

    it("Ctrl+V in root B hits only bridge B", () => {
        focusedEditor(rootB).dispatchEvent(ctrl("v"));
        expect(bridgeB.requestClipboard).toHaveBeenCalledTimes(1);
        expect(bridgeA.requestClipboard).not.toHaveBeenCalled();
    });

    it("command-palette copy in root B hits only bridge B", () => {
        vi.spyOn(window, "getSelection").mockReturnValue({
            toString: () => "b-text",
        } as unknown as Selection);
        focusedEditor(rootB);
        document.execCommand("copy");
        expect(bridgeB.writeClipboard).toHaveBeenCalledWith("b-text");
        expect(bridgeA.writeClipboard).not.toHaveBeenCalled();
    });
});

describe("disposal", () => {
    it("leaves the first instance inert while the second stays live and the guard active", () => {
        const rootA = makeRoot();
        const rootB = makeRoot();
        const bridgeA = makeBridge();
        const bridgeB = makeBridge();
        const disposeA = install([rootA], bridgeA);
        install([rootB], bridgeB);
        addGuardSpies();

        disposeA();

        focusedEditor(rootA).dispatchEvent(ctrl("v"));
        expect(bridgeA.requestClipboard).not.toHaveBeenCalled();

        focusedEditor(rootB).dispatchEvent(ctrl("v"));
        expect(bridgeB.requestClipboard).toHaveBeenCalledTimes(1);

        // The spy sees every keydown that bubbles to document; only the Ctrl+A guard is under test here.
        bpmnJsKeyboardSpy.mockClear();
        focusedInput().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).not.toHaveBeenCalled();
    });

    it("removes all document hooks after the last instance is disposed", () => {
        const rootA = makeRoot();
        const rootB = makeRoot();
        const disposeA = install([rootA], makeBridge());
        const disposeB = install([rootB], makeBridge());
        addGuardSpies();

        disposeA();
        disposeB();

        focusedInput().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).toHaveBeenCalledTimes(1);
        expect(Object.getOwnPropertyDescriptor(document, "execCommand")).toBeUndefined();
    });

    it("removes hooks regardless of disposal order (last-out wins)", () => {
        const rootA = makeRoot();
        const rootB = makeRoot();
        const disposeA = install([rootA], makeBridge());
        const disposeB = install([rootB], makeBridge());
        addGuardSpies();

        disposeB();
        disposeA();

        focusedInput().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).toHaveBeenCalledTimes(1);
        expect(Object.getOwnPropertyDescriptor(document, "execCommand")).toBeUndefined();
    });

    it("re-registers a fresh bridge on recreation", () => {
        const root = makeRoot();
        const disposeOld = install([root], makeBridge());
        disposeOld();

        const freshBridge = makeBridge();
        install([root], freshBridge);

        focusedEditor(root).dispatchEvent(ctrl("v"));
        expect(freshBridge.requestClipboard).toHaveBeenCalledTimes(1);
    });
});

describe("disposer idempotence and ownership", () => {
    it("a second call to the same disposer is a no-op", () => {
        const root = makeRoot();
        const bridge = makeBridge();
        const dispose = install([root], bridge);

        dispose();
        dispose();

        install([root], bridge);
        focusedEditor(root).dispatchEvent(ctrl("v"));
        expect(bridge.requestClipboard).toHaveBeenCalledTimes(1);
    });

    it("a stale disposer cannot evict a live re-registration of the same root", () => {
        const root = makeRoot();
        const staleDispose = install([root], makeBridge());

        const liveBridge = makeBridge();
        install([root], liveBridge);

        staleDispose();

        focusedEditor(root).dispatchEvent(ctrl("v"));
        expect(liveBridge.requestClipboard).toHaveBeenCalledTimes(1);
    });
});

describe("label exclusion for the direct-editing textbox", () => {
    let root: HTMLElement;
    let polyfillBridge: Bridge;
    let labelBridge: Bridge;

    function attachLabelModule(editor: HTMLElement): void {
        editor.addEventListener(
            "keydown",
            (e) => {
                if (!(e.metaKey || e.ctrlKey)) return;
                if (e.key === "v") {
                    e.preventDefault();
                    void labelBridge.requestClipboard();
                } else if (e.key === "c") {
                    labelBridge.writeClipboard("label");
                }
            },
            true,
        );
    }

    beforeEach(() => {
        root = makeRoot();
        polyfillBridge = makeBridge();
        labelBridge = makeBridge();
        install([root], polyfillBridge);
    });

    it("lets the label module handle Ctrl+V while the polyfill stands down", () => {
        const editor = focusedEditor(root, "djs-direct-editing-content");
        attachLabelModule(editor);

        editor.dispatchEvent(ctrl("v"));

        expect(labelBridge.requestClipboard).toHaveBeenCalledTimes(1);
        expect(polyfillBridge.requestClipboard).not.toHaveBeenCalled();
    });

    it("lets the label module handle Ctrl+C while the polyfill stands down", () => {
        const editor = focusedEditor(root, "djs-direct-editing-content");
        attachLabelModule(editor);

        editor.dispatchEvent(ctrl("c"));

        expect(labelBridge.writeClipboard).toHaveBeenCalledWith("label");
        expect(polyfillBridge.writeClipboard).not.toHaveBeenCalled();
    });

    it("suppresses the keydown-adjacent command-palette paste via the dedup flag", () => {
        const editor = focusedEditor(root, "djs-direct-editing-content");
        attachLabelModule(editor);

        editor.dispatchEvent(ctrl("v"));
        document.execCommand("paste");

        expect(polyfillBridge.requestClipboard).not.toHaveBeenCalled();
    });

    it("still serves a standalone command-palette paste during label editing", () => {
        const editor = focusedEditor(root, "djs-direct-editing-content");
        attachLabelModule(editor);

        editor.dispatchEvent(ctrl("v"));
        // Past the dedup window, a fresh command-palette paste must be served — the
        // execCommand hook carries no label exclusion.
        vi.advanceTimersByTime(200);
        document.execCommand("paste");

        expect(polyfillBridge.requestClipboard).toHaveBeenCalledTimes(1);
    });
});

describe("dedup window resets across teardown and re-install", () => {
    it("serves the first paste after a re-install even if a stale window was open", () => {
        const root = makeRoot();
        const firstBridge = makeBridge();
        const disposeFirst = install([root], firstBridge);

        // Open the dedup window, then tear down before it elapses.
        focusedEditor(root).dispatchEvent(ctrl("v"));
        disposeFirst();

        const secondBridge = makeBridge();
        install([root], secondBridge);

        focusedEditor(root);
        document.execCommand("paste");
        expect(secondBridge.requestClipboard).toHaveBeenCalledTimes(1);
    });
});
