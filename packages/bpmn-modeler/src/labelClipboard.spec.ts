import { beforeEach, describe, expect, it, vi } from "vitest";

// LabelClipboard is not exported from the package barrel; reach the class through the DI tuple.
import { LabelClipboardModule } from "../../../libs/bpmn-clipboard/src/LabelClipboardModule";

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

    it("does not attach when the textbox has no content element", () => {
        directEditing._textbox = undefined as unknown as { content: HTMLDivElement };
        emit("directEditing.activate");

        content.dispatchEvent(ctrl("v"));

        expect(bridge.requestClipboard).not.toHaveBeenCalled();
    });

    it("detaches the handler on deactivate", () => {
        emit("directEditing.activate");
        emit("directEditing.deactivate");

        content.dispatchEvent(ctrl("v"));

        expect(bridge.requestClipboard).not.toHaveBeenCalled();
    });
});
