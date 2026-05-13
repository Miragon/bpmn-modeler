import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { installContentEditableClipboardPolyfill } from "./propertiesPanelClipboard";

const mocks = {
    requestClipboard: vi.fn().mockResolvedValue(""),
    writeClipboard: vi.fn<(text: string) => void>(),
};

/**
 * Bubble-phase spy that stands in for bpmn-js's `Keyboard` service: if the
 * guard correctly stops propagation, this never fires; if propagation leaks
 * through, this records the keystroke as bpmn-js would have seen it.
 */
const bpmnJsKeyboardSpy = vi.fn<(e: KeyboardEvent) => void>();

/**
 * Bubble-phase spy on `window` that stands in for Theia's webview
 * pre-bootstrap forwarder. The real forwarder lives on the inner iframe's
 * window in bubble phase and posts the keystroke to the outer Theia shell
 * unconditionally (no `defaultPrevented` gate); if it fires, the outer
 * shell runs SELECT_ALL = `document.execCommand("selectAll")` against the
 * whole Theia chrome. The Ctrl+A guard must stop the bubble at `document`
 * so this never sees the event — for *every* surface, canvas included.
 */
const theiaForwarderSpy = vi.fn<(e: KeyboardEvent) => void>();

beforeAll(() => {
    vi.useFakeTimers();
    installContentEditableClipboardPolyfill(
        () => mocks.requestClipboard(),
        (text) => mocks.writeClipboard(text),
    );
    document.addEventListener("keydown", (e) => bpmnJsKeyboardSpy(e));
    window.addEventListener("keydown", (e) => theiaForwarderSpy(e));
});

afterAll(() => {
    vi.useRealTimers();
});

beforeEach(() => {
    vi.runAllTimers();
    mocks.requestClipboard.mockReset().mockResolvedValue("");
    mocks.writeClipboard.mockReset();
    bpmnJsKeyboardSpy.mockReset();
    theiaForwarderSpy.mockReset();
    document.body.innerHTML = "";
});

afterEach(() => {
    vi.restoreAllMocks();
});

function focusedInput(): HTMLInputElement {
    const el = document.createElement("input");
    document.body.appendChild(el);
    el.focus();
    return el;
}

function focusedTextarea(): HTMLTextAreaElement {
    const el = document.createElement("textarea");
    document.body.appendChild(el);
    el.focus();
    return el;
}

function focusedEditor(): HTMLDivElement {
    const el = document.createElement("div");
    el.contentEditable = "true";
    el.tabIndex = -1;
    document.body.appendChild(el);
    el.focus();
    return el;
}

function focusedDiv(): HTMLDivElement {
    const el = document.createElement("div");
    el.tabIndex = 0;
    document.body.appendChild(el);
    el.focus();
    return el;
}

function ctrl(key: string): KeyboardEvent {
    return new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true });
}

describe("Ctrl+A guard: text-editing surfaces own their selection", () => {
    it("does not let Ctrl+A in a properties-panel <input> reach bpmn-js", () => {
        focusedInput().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).not.toHaveBeenCalled();
    });

    it("does not let Ctrl+A in a <textarea> reach bpmn-js", () => {
        focusedTextarea().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).not.toHaveBeenCalled();
    });

    it("does not let Ctrl+A in a contenteditable (label / FEEL editor) reach bpmn-js", () => {
        focusedEditor().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).not.toHaveBeenCalled();
    });

    it("lets Ctrl+A on a non-text element propagate so bpmn-js can select the canvas", () => {
        focusedDiv().dispatchEvent(ctrl("a"));
        expect(bpmnJsKeyboardSpy).toHaveBeenCalledTimes(1);
    });
});

describe("Ctrl+A guard: block the Theia outer-shell SELECT_ALL forward", () => {
    it("stops Ctrl+A on the canvas before it reaches `window`", () => {
        focusedDiv().dispatchEvent(ctrl("a"));
        expect(theiaForwarderSpy).not.toHaveBeenCalled();
    });

    it("stops Ctrl+A in an <input> before it reaches `window`", () => {
        focusedInput().dispatchEvent(ctrl("a"));
        expect(theiaForwarderSpy).not.toHaveBeenCalled();
    });

    it("stops Ctrl+A in a contenteditable before it reaches `window`", () => {
        focusedEditor().dispatchEvent(ctrl("a"));
        expect(theiaForwarderSpy).not.toHaveBeenCalled();
    });
});

describe("copy and paste in the FEEL expression editor", () => {
    it("Ctrl+V pastes from the extension-host clipboard into the editor", () => {
        focusedEditor().dispatchEvent(ctrl("v"));
        expect(mocks.requestClipboard).toHaveBeenCalled();
    });

    it("Ctrl+C copies the selected expression text to the extension-host clipboard", () => {
        const editor = focusedEditor();
        vi.spyOn(window, "getSelection").mockReturnValue({
            toString: () => "some expression",
        } as unknown as Selection);
        editor.dispatchEvent(ctrl("c"));
        expect(mocks.writeClipboard).toHaveBeenCalledWith("some expression");
    });

    it("paste does nothing when a plain element (not an editor) is focused", () => {
        focusedDiv().dispatchEvent(ctrl("v"));
        expect(mocks.requestClipboard).not.toHaveBeenCalled();
    });
});

describe("paste triggered via the VS Code command palette", () => {
    it("writes clipboard text into the focused FEEL editor", () => {
        focusedEditor();
        document.execCommand("paste");
        expect(mocks.requestClipboard).toHaveBeenCalled();
    });

    it("paste only happens once when both keyboard shortcut and command palette fire", () => {
        const editor = focusedEditor();
        editor.dispatchEvent(ctrl("v"));
        document.execCommand("paste");
        expect(mocks.requestClipboard).toHaveBeenCalledTimes(1);
    });
});
