import { describe, expect, it, vi } from "vitest";

import { ElementTemplateFileQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost, InMemorySettings } from "../../../testing";
import { ElementTemplateEditorService } from "./ElementTemplateEditorService";

const PATH = "/work/.camunda/element-templates/status.json";
const TEMPLATE = '{"$schema":"…/zeebe-element-templates-json-schema/…","id":"status"}';

function createService(content: string) {
    const host = createTestHost();
    const editor = host.openEditor(PATH, content);
    const settings = new InMemorySettings({ language: "de" });
    const service = new ElementTemplateEditorService(
        host.store,
        host.documents,
        settings,
        host.notifier,
    );
    service.registerSession(editor.id);
    return { service, host, editor };
}

describe("ElementTemplateEditorService", () => {
    it.each([
        ["a template", TEMPLATE],
        ["an empty file", ""],
        ["broken JSON", '{ "id": '],
    ])("sends %s to the preview as it is, without writing", async (_, content) => {
        const { service, editor } = createService(content);

        expect(await service.display(editor.id)).toBe(true);
        expect(editor.posted).toEqual([new ElementTemplateFileQuery(content, 0, "de")]);
        expect(editor.content).toBe(content);
        expect(editor.saveCount).toBe(0);
    });

    it("sends each host edit with the document's revision", async () => {
        const { service, editor } = createService(TEMPLATE);
        await service.display(editor.id);

        editor.content = '{"id":"edited"}';
        expect(await service.display(editor.id, true)).toBe(true);

        expect(editor.posted.at(-1)).toEqual(
            new ElementTemplateFileQuery('{"id":"edited"}', 1, "de"),
        );
    });

    it("stays quiet when the preview is hidden", async () => {
        const { service, host, editor } = createService(TEMPLATE);
        editor.hidden = true;

        expect(await service.display(editor.id)).toBe(false);
        expect(host.notifier.errors).toEqual([]);
    });

    it("reports any other failure", async () => {
        const { service, host, editor } = createService(TEMPLATE);
        vi.spyOn(host.store, "postMessage").mockRejectedValueOnce(new Error("channel closed"));

        expect(await service.display(editor.id)).toBe(false);
        expect(host.notifier.errors).toEqual([
            "A problem occurred while trying to display the element template preview.\nchannel closed",
        ]);
    });

    describe("writing an edit back", () => {
        it("writes the template editor's text into the document", async () => {
            const { service, editor } = createService(TEMPLATE);

            expect(await service.sync(editor.id, '{"id":"edited"}', 0)).toBe(true);

            expect(editor.content).toBe('{"id":"edited"}');
        });

        // The host reports the change while the write is still applying.
        it("does not send its own write back to the template editor", async () => {
            const { service, host, editor } = createService(TEMPLATE);
            let finishWrite: (written: boolean) => void = () => {};
            vi.spyOn(host.documents, "write").mockImplementationOnce(async (_id, content) => {
                editor.content = content;
                return new Promise<boolean>((resolve) => {
                    finishWrite = resolve;
                });
            });

            const syncing = service.sync(editor.id, '{"id":"edited"}', 0);
            await Promise.resolve();
            expect(await service.display(editor.id, true)).toBe(false);
            finishWrite(true);
            await syncing;

            expect(editor.posted).toEqual([]);
        });

        it("refuses an edit made on an older version of the document", async () => {
            const { service, editor } = createService(TEMPLATE);
            await service.display(editor.id, true);

            expect(await service.sync(editor.id, '{"id":"stale"}', 0)).toBe(false);
            expect(editor.content).toBe(TEMPLATE);
        });

        it("reports a write that fails", async () => {
            const { service, host, editor } = createService(TEMPLATE);
            vi.spyOn(host.documents, "write").mockRejectedValueOnce(new Error("disk full"));

            expect(await service.sync(editor.id, "{}", 0)).toBe(false);
            expect(host.notifier.errors).toEqual([
                "A problem occurred while trying to save the element template.\ndisk full",
            ]);
        });
    });
});
