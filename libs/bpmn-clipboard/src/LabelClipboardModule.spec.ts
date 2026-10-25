import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// LabelClipboard is not exported; reach the class through the DI tuple.
import { LabelClipboardModule } from "./LabelClipboardModule";
import { FakeClipboardEvent, FakeDataTransfer } from "./__fixtures__/clipboardEvents";

type Bridge = {
    requestClipboard: () => Promise<string>;
    writeClipboard: (text: string) => void;
};

const LabelClipboard = LabelClipboardModule.labelClipboard[1] as new (
    bridge: Bridge,
    eventBus: unknown,
    directEditing: unknown,
) => unknown;

let handlers: Record<string, Array<() => void>>;

function makeEventBus() {
    handlers = {};
    return {
        on: (event: string, cb: () => void) => {
            (handlers[event] ??= []).push(cb);
        },
    };
}

function emit(event: string): void {
    (handlers[event] ?? []).forEach((cb) => cb());
}

function ctrl(key: string): KeyboardEvent {
    return new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
}

let bridge: {
    requestClipboard: ReturnType<typeof vi.fn>;
    writeClipboard: ReturnType<typeof vi.fn>;
};
let content: HTMLDivElement;
let directEditing: { _textbox: { content: HTMLDivElement } };

beforeEach(() => {
    bridge = {
        // Empty result skips the synthetic-paste dispatch (jsdom lacks ClipboardEvent);
        // the assertion only cares that the bridge read was requested.
        requestClipboard: vi.fn().mockResolvedValue(""),
        writeClipboard: vi.fn(),
    };
    content = document.createElement("div");
    content.contentEditable = "true";
    document.body.appendChild(content);
    directEditing = { _textbox: { content } };
    new LabelClipboard(bridge as unknown as Bridge, makeEventBus(), directEditing);
});

describe("LabelClipboard", () => {
    it("routes Ctrl+V through the bridge and prevents default while editing", () => {
        emit("directEditing.activate");

        const event = ctrl("v");
        content.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(bridge.requestClipboard).toHaveBeenCalledTimes(1);
    });

    it("copies the current selection through the bridge on Ctrl+C", () => {
        emit("directEditing.activate");
        vi.spyOn(window, "getSelection").mockReturnValue({
            toString: () => "label text",
        } as unknown as Selection);

        content.dispatchEvent(ctrl("c"));

        expect(bridge.writeClipboard).toHaveBeenCalledWith("label text");
    });

    it("selects the textbox contents on Ctrl+A without leaking to bpmn-js", () => {
        emit("directEditing.activate");
        const addRange = vi.fn();
        vi.spyOn(window, "getSelection").mockReturnValue({
            removeAllRanges: vi.fn(),
            addRange,
        } as unknown as Selection);

        const event = ctrl("a");
        content.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(addRange).toHaveBeenCalledTimes(1);
    });

    it("degrades to no clipboard and logs when the textbox shape is unexpected", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        directEditing._textbox = undefined as unknown as { content: HTMLDivElement };
        emit("directEditing.activate");

        content.dispatchEvent(ctrl("v"));

        expect(bridge.requestClipboard).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledTimes(1);
        consoleError.mockRestore();
    });

    it("detaches the handler on deactivate", () => {
        emit("directEditing.activate");
        emit("directEditing.deactivate");

        content.dispatchEvent(ctrl("v"));

        expect(bridge.requestClipboard).not.toHaveBeenCalled();
    });

    it("ignores keys pressed without Ctrl or Cmd", () => {
        emit("directEditing.activate");

        const event = new KeyboardEvent("keydown", { key: "v", bubbles: true, cancelable: true });
        content.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(bridge.requestClipboard).not.toHaveBeenCalled();
    });

    it("keeps the clipboard untouched when Ctrl+C is pressed without a selection", () => {
        emit("directEditing.activate");
        vi.spyOn(window, "getSelection").mockReturnValue({
            toString: () => "",
        } as unknown as Selection);

        content.dispatchEvent(ctrl("c"));

        expect(bridge.writeClipboard).not.toHaveBeenCalled();
    });
});

describe("LabelClipboard paste into the label", () => {
    const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
    let insertText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.stubGlobal("DataTransfer", FakeDataTransfer);
        vi.stubGlobal("ClipboardEvent", FakeClipboardEvent);
        // jsdom does not implement execCommand.
        insertText = vi.fn();
        Object.defineProperty(document, "execCommand", { value: insertText, configurable: true });
        bridge.requestClipboard.mockResolvedValue("pasted text");
        content.tabIndex = 0;
        content.focus();
        emit("directEditing.activate");
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete (document as { execCommand?: unknown }).execCommand;
        content.remove();
    });

    it("hands the host clipboard text to a paste handler on the label", async () => {
        const pastedTexts: string[] = [];
        content.addEventListener("paste", (event) => {
            event.preventDefault();
            pastedTexts.push((event as FakeClipboardEvent).clipboardData!.getData("text/plain"));
        });

        content.dispatchEvent(ctrl("v"));
        await flush();

        expect(pastedTexts).toEqual(["pasted text"]);
        expect(insertText).not.toHaveBeenCalled();
    });

    it("inserts the text itself when no handler consumes the paste", async () => {
        content.dispatchEvent(ctrl("v"));
        await flush();

        expect(insertText).toHaveBeenCalledWith("insertText", false, "pasted text");
    });

    it("pastes nothing when the host clipboard is empty", async () => {
        bridge.requestClipboard.mockResolvedValue("");

        content.dispatchEvent(ctrl("v"));
        await flush();

        expect(insertText).not.toHaveBeenCalled();
    });
});
