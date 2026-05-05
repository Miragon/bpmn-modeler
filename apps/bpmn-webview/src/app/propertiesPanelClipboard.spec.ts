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
    onSelectAll: vi.fn(),
};

beforeAll(() => {
    vi.useFakeTimers();
    installContentEditableClipboardPolyfill(
        () => mocks.requestClipboard(),
        (text) => mocks.writeClipboard(text),
        () => mocks.onSelectAll(),
    );
});

afterAll(() => {
    vi.useRealTimers();
});

beforeEach(() => {
    vi.runAllTimers();
    mocks.requestClipboard.mockReset().mockResolvedValue("");
    mocks.writeClipboard.mockReset();
    mocks.onSelectAll.mockReset();
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

describe("selecting all text in a properties-panel input (Ctrl+A)", () => {
    it("selects all text in the field", () => {
        const input = focusedInput();
        const selectSpy = vi.spyOn(input, "select");
        input.dispatchEvent(ctrl("a"));
        expect(selectSpy).toHaveBeenCalled();
    });

    it("does not accidentally trigger diagram-element selection", () => {
        const input = focusedInput();
        input.dispatchEvent(ctrl("a"));
        expect(mocks.onSelectAll).not.toHaveBeenCalled();
    });
});

describe("selecting all elements in the diagram (Ctrl+A on the canvas)", () => {
    it("selects all elements in the diagram", () => {
        const canvas = focusedDiv();
        canvas.dispatchEvent(ctrl("a"));
        expect(mocks.onSelectAll).toHaveBeenCalled();
    });
});

describe("copy and paste in the FEEL expression editor", () => {
    it("Ctrl+V pastes from the extension-host clipboard into the editor", () => {
        const editor = focusedEditor();
        editor.dispatchEvent(ctrl("v"));
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
        const div = focusedDiv();
        div.dispatchEvent(ctrl("v"));
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
