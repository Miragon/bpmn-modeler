import { beforeEach, describe, expect, it, vi } from "vitest";

// `BpmnClipboardMediator` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { ClipboardQuery, TextClipboardQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnClipboardMediator } from "./BpmnClipboardMediator";

const EDITOR = "file:///work/diagram.bpmn";

function createMediator() {
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const clipboard = {
        readClipboard: vi.fn().mockResolvedValue(""),
        writeClipboard: vi.fn().mockResolvedValue(undefined),
    };
    const notifier = { logError: vi.fn() };

    const mediator = new BpmnClipboardMediator(
        editorStore as never,
        clipboard as never,
        notifier as never,
    );

    return { mediator, editorStore, clipboard, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnClipboardMediator.readClipboard", () => {
    it("posts the host clipboard text as a ClipboardQuery", async () => {
        const { mediator, editorStore, clipboard } = createMediator();
        clipboard.readClipboard.mockResolvedValue("<bpmn-copy/>");

        const result = await mediator.readClipboard(EDITOR);

        expect(result).toBe(true);
        const [id, msg] = editorStore.postMessage.mock.calls[0];
        expect(id).toBe(EDITOR);
        expect(msg).toBeInstanceOf(ClipboardQuery);
        expect((msg as ClipboardQuery).text).toBe("<bpmn-copy/>");
    });

    it("logs and returns false when reading the clipboard throws", async () => {
        const { mediator, clipboard, notifier, editorStore } = createMediator();
        clipboard.readClipboard.mockRejectedValue(new Error("denied"));

        const result = await mediator.readClipboard(EDITOR);

        expect(result).toBe(false);
        expect(notifier.logError).toHaveBeenCalledOnce();
        expect(editorStore.postMessage).not.toHaveBeenCalled();
    });
});

describe("BpmnClipboardMediator.readTextClipboard", () => {
    it("posts the host clipboard text as a TextClipboardQuery", async () => {
        const { mediator, editorStore, clipboard } = createMediator();
        clipboard.readClipboard.mockResolvedValue("plain text");

        const result = await mediator.readTextClipboard(EDITOR);

        expect(result).toBe(true);
        const msg = editorStore.postMessage.mock.calls[0][1];
        expect(msg).toBeInstanceOf(TextClipboardQuery);
        expect((msg as TextClipboardQuery).text).toBe("plain text");
    });

    it("logs and returns false when reading the clipboard throws", async () => {
        const { mediator, clipboard, notifier } = createMediator();
        clipboard.readClipboard.mockRejectedValue(new Error("denied"));

        const result = await mediator.readTextClipboard(EDITOR);

        expect(result).toBe(false);
        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});

describe("BpmnClipboardMediator.writeClipboard", () => {
    it("writes the text to the host clipboard", async () => {
        const { mediator, clipboard } = createMediator();

        await mediator.writeClipboard("payload");

        expect(clipboard.writeClipboard).toHaveBeenCalledWith("payload");
    });

    it("swallows and logs a write failure", async () => {
        const { mediator, clipboard, notifier } = createMediator();
        clipboard.writeClipboard.mockRejectedValue(new Error("write failed"));

        await expect(mediator.writeClipboard("payload")).resolves.toBeUndefined();
        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});
