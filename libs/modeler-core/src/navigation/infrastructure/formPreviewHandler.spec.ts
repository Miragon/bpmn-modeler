import { describe, expect, it, vi } from "vitest";
import { FormPreviewQuery, GetFormPreviewCommand } from "@miragon/bpmn-modeler-shared";
import { createTestHost } from "../../testing";
import { FormPreviewService } from "../service/FormPreviewService";
import { ReferencedModelLocator } from "../service/ReferencedModelLocator";
import { getFormPreviewHandler } from "./navigationMessageHandlers";

function setup() {
    const host = createTestHost({
        folders: ["/work"],
        files: { "/work/a.form": '{"id":"Form_1","components":[]}' },
    });
    const editor = host.openEditor("/work/process.bpmn");
    const service = new FormPreviewService(
        new ReferencedModelLocator(host.workspace, host.notifier),
        host.workspace,
        host.picker,
        host.notifier,
    );
    const handler = getFormPreviewHandler(host.store, service);
    return { host, editor, handler, service };
}

describe("form preview host handler", () => {
    it("answers success and missing references with the matching request id", async () => {
        const { editor, handler } = setup();
        await handler(new GetFormPreviewCommand(7, "Form_1"), editor.id);
        await handler(new GetFormPreviewCommand(8, "Missing"), editor.id);
        expect(editor.posted).toEqual([
            new FormPreviewQuery(7, { kind: "loaded", content: '{"id":"Form_1","components":[]}' }),
            new FormPreviewQuery(8, { kind: "unavailable", reason: "notFound" }),
        ]);
    });

    it("answers malformed form references without searching", async () => {
        const { editor, handler, service } = setup();
        const read = vi.spyOn(service, "read");
        await handler(new GetFormPreviewCommand(9, ""), editor.id);
        expect(read).not.toHaveBeenCalled();
        expect(editor.posted).toEqual([
            new FormPreviewQuery(9, { kind: "unavailable", reason: "notFound" }),
        ]);
    });

    it("answers read failures instead of rejecting or opening an editor", async () => {
        const { editor, handler, host } = setup();
        vi.spyOn(host.workspace, "readFile").mockRejectedValue(new Error("permission denied"));
        await handler(new GetFormPreviewCommand(10, "Form_1"), editor.id);
        expect(editor.posted).toEqual([
            new FormPreviewQuery(10, { kind: "unavailable", reason: "unreadable" }),
        ]);
        expect(host.notifier.openedDocuments).toEqual([]);
    });

    it("does not deliver an old session's result into a replacement editor", async () => {
        const { editor, handler, service, host } = setup();
        let finish!: (result: { kind: "loaded"; content: string }) => void;
        vi.spyOn(service, "read").mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const pending = handler(new GetFormPreviewCommand(11, "Form_1"), editor.id);
        host.store.unregister(editor.id, editor);
        const replacement = host.openEditor("/work/process.bpmn");
        finish({ kind: "loaded", content: "old" });
        await pending;
        expect(editor.posted).toEqual([]);
        expect(replacement.posted).toEqual([]);
    });
});
