import { describe, expect, it, vi } from "vitest";

import { ClipboardQuery, TextClipboardQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { BpmnClipboardMediator } from "./BpmnClipboardMediator";

function createMediator() {
    const host = createTestHost();
    const editor = host.openEditor("/work/diagram.bpmn");
    const mediator = new BpmnClipboardMediator(host.store, host.clipboard, host.notifier);
    return { mediator, host, editor };
}

describe("BpmnClipboardMediator.readClipboard", () => {
    it("posts the host clipboard text as a ClipboardQuery", async () => {
        const { mediator, host, editor } = createMediator();
        host.clipboard.text = "<bpmn-copy/>";

        await mediator.readClipboard(editor.id);

        expect(editor.posted).toHaveLength(1);
        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(ClipboardQuery);
        expect((msg as ClipboardQuery).text).toBe("<bpmn-copy/>");
    });

    it("answers with empty text when reading the clipboard throws", async () => {
        const { mediator, host, editor } = createMediator();
        const denied = new Error("denied");
        vi.spyOn(host.clipboard, "readClipboard").mockRejectedValue(denied);

        await mediator.readClipboard(editor.id);

        expect(host.notifier.logged("error")).toEqual([denied.stack]);
        expect(editor.posted).toHaveLength(1);
        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(ClipboardQuery);
        expect((msg as ClipboardQuery).text).toBe("");
    });

    it("logs, without throwing, an empty reply that cannot be posted", async () => {
        const { mediator, host, editor } = createMediator();
        const denied = new Error("denied");
        vi.spyOn(host.clipboard, "readClipboard").mockRejectedValue(denied);
        editor.hidden = true;

        await expect(mediator.readClipboard(editor.id)).resolves.toBeUndefined();
        expect(host.notifier.logged("error")).toEqual([
            denied.stack,
            expect.stringContaining("Error: The active editor is hidden.\n"),
        ]);
    });
});

describe("BpmnClipboardMediator.readTextClipboard", () => {
    it("posts the host clipboard text as a TextClipboardQuery", async () => {
        const { mediator, host, editor } = createMediator();
        host.clipboard.text = "plain text";

        await mediator.readTextClipboard(editor.id);

        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(TextClipboardQuery);
        expect((msg as TextClipboardQuery).text).toBe("plain text");
    });

    it("answers with empty text when reading the clipboard throws", async () => {
        const { mediator, host, editor } = createMediator();
        const denied = new Error("denied");
        vi.spyOn(host.clipboard, "readClipboard").mockRejectedValue(denied);

        await mediator.readTextClipboard(editor.id);

        expect(host.notifier.logged("error")).toEqual([denied.stack]);
        expect(editor.posted).toHaveLength(1);
        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(TextClipboardQuery);
        expect((msg as TextClipboardQuery).text).toBe("");
    });

    it("logs, without throwing, a reply that cannot be posted", async () => {
        const { mediator, host } = createMediator();
        const closedEditor = "file:///work/closed.bpmn";

        await expect(mediator.readTextClipboard(closedEditor)).resolves.toBeUndefined();
        expect(host.notifier.logged("error")).toEqual([
            expect.stringContaining(`Error: No editor found for id: ${closedEditor}\n`),
        ]);
    });
});

describe("BpmnClipboardMediator.writeClipboard", () => {
    it("writes the text to the host clipboard", async () => {
        const { mediator, host } = createMediator();

        await mediator.writeClipboard("payload");

        expect(host.clipboard.text).toBe("payload");
    });

    it("swallows and logs a write failure", async () => {
        const { mediator, host } = createMediator();
        const writeFailed = new Error("write failed");
        vi.spyOn(host.clipboard, "writeClipboard").mockRejectedValue(writeFailed);

        await expect(mediator.writeClipboard("payload")).resolves.toBeUndefined();
        expect(host.notifier.logged("error")).toEqual([writeFailed.stack]);
    });
});
