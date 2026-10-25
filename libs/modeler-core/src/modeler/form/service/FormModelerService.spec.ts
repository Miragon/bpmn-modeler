import { describe, expect, it, vi } from "vitest";

import { FormFileQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost, TestHost } from "../../../testing";
import { FormModelerService } from "./FormModelerService";

const PATH = "/work/request.form";
const FORM = '{"components":[],"type":"default","id":"Form_Request"}';

function createService(content: string) {
    const host = createTestHost();
    const editor = host.openEditor(PATH, content);
    const service = new FormModelerService(host.store, host.documents, host.notifier);
    service.registerSession(editor.id);
    return { service, host, editor };
}

function holdNextWrite(host: TestHost) {
    let finishWrite: (changed: boolean) => void = () => {};
    const write = vi.spyOn(host.documents, "write").mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
            finishWrite = resolve;
        }),
    );
    return { write, finishWrite: (changed: boolean) => finishWrite(changed) };
}

describe("FormModelerService", () => {
    it("renders existing content without rewriting it", async () => {
        const { service, editor } = createService(FORM);

        expect(await service.display(editor.id)).toBe(true);
        expect(editor.posted).toEqual([new FormFileQuery(FORM)]);
        expect(editor.content).toBe(FORM);
        expect(editor.saveCount).toBe(0);
    });

    it("seeds and saves an empty form before rendering", async () => {
        const { service, editor } = createService("");

        expect(await service.display(editor.id)).toBe(true);
        expect(JSON.parse(editor.content)).toEqual(
            expect.objectContaining({ id: expect.stringMatching(/^Form_[A-Za-z0-9]{8}$/) }),
        );
        expect(editor.saveCount).toBe(1);
        expect(editor.posted).toEqual([new FormFileQuery(editor.content)]);
    });

    it("does not render or save a fallback form when its host write is rejected", async () => {
        const { service, host, editor } = createService("");
        vi.spyOn(host.documents, "write").mockResolvedValueOnce(false);

        expect(await service.display(editor.id)).toBe(false);
        expect(editor.saveCount).toBe(0);
        expect(editor.posted).toEqual([]);
        expect(host.notifier.errors).toEqual([
            "A problem occurred while trying to display the Form Editor.\nThe empty document could not be initialized.",
        ]);
    });

    it("uses one form id when blank initialization overlaps", async () => {
        const { service, host, editor } = createService("");
        const { write, finishWrite } = holdNextWrite(host);

        const firstDisplay = service.display(editor.id);

        expect(await service.display(editor.id)).toBe(false);
        expect(write).toHaveBeenCalledOnce();
        finishWrite(true);
        expect(await firstDisplay).toBe(true);

        const emptyForm = write.mock.calls[0][1];
        expect(editor.posted).toEqual([new FormFileQuery(emptyForm)]);
    });

    it("supersedes blank initialization after a host update", async () => {
        const { service, host, editor } = createService("");
        const { write, finishWrite } = holdNextWrite(host);

        const firstDisplay = service.display(editor.id);

        expect(await service.display(editor.id, true)).toBe(true);
        finishWrite(false);
        expect(await firstDisplay).toBe(false);

        expect(host.store.currentHostDocumentRevision(editor.id)).toBe(1);
        expect(write).toHaveBeenCalledTimes(2);
        expect(editor.saveCount).toBe(1);
        expect(editor.posted).toEqual([new FormFileQuery(editor.content, 1)]);
        expect(host.notifier.errors).toEqual([]);
    });

    it("does not save or render an initialized form into a replacement session", async () => {
        const { service, host, editor } = createService("");
        const { finishWrite } = holdNextWrite(host);

        const displaying = service.display(editor.id);
        const replacement = host.openEditor(PATH, "");
        finishWrite(true);

        expect(await displaying).toBe(false);
        expect(editor.saveCount + replacement.saveCount).toBe(0);
        expect([...editor.posted, ...replacement.posted]).toEqual([]);
    });

    it("suppresses the matching document-change echo while syncing", async () => {
        const { service, host, editor } = createService("<xml/>");
        const { finishWrite } = holdNextWrite(host);

        const syncing = service.sync(editor.id, "<xml/>");
        expect(await service.display(editor.id)).toBe(false);
        expect(editor.posted).toEqual([]);
        finishWrite(true);
        await syncing;
    });

    it("releases the guard and reports a failed sync", async () => {
        const { service, host, editor } = createService(FORM);
        vi.spyOn(host.documents, "write").mockRejectedValueOnce(new Error("write failed"));

        expect(await service.sync(editor.id, FORM)).toBe(false);
        expect(host.notifier.errors).toEqual([
            "A problem occurred while trying to sync the form file.\nwrite failed",
        ]);
        await service.display(editor.id);
        expect(editor.posted).toHaveLength(1);
    });

    it("rejects content exported from an older host document revision", async () => {
        const { service, editor } = createService(FORM);
        await service.display(editor.id, true);

        const [query] = editor.postedOfType<FormFileQuery>("FormFileQuery");
        expect(query.documentRevision).toBe(1);
        expect(await service.sync(editor.id, "{}", 0)).toBe(false);
        expect(editor.content).toBe(FORM);
    });
});
