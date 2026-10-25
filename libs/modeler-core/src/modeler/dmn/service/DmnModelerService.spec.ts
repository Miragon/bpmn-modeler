import { describe, expect, it, vi } from "vitest";

import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { UserCancelledError } from "../../../shared/domain/errors";
import { createTestHost, TestHost } from "../../../testing";
import { DmnModelerService } from "./DmnModelerService";

const DMN_DOC =
    '<?xml version="1.0"?><definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" id="d"/>';

function createService(content = DMN_DOC) {
    const host = createTestHost();
    const editor = host.openEditor("/work/decision.dmn", content);
    const service = new DmnModelerService(host.store, host.documents, host.notifier);
    service.registerSession(editor.id);
    return { service, host, editor };
}

function holdNextWrite(host: TestHost) {
    let finishWrite: (applied: boolean) => void = () => {};
    vi.spyOn(host.documents, "write").mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
            finishWrite = resolve;
        }),
    );
    return (applied: boolean) => finishWrite(applied);
}

describe("DmnModelerService.display", () => {
    it("renders an existing document untouched", async () => {
        const { service, editor } = createService();

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(true);
        const [msg] = editor.postedOfType<DmnFileQuery>("DmnFileQuery");
        expect(msg.content).toBe(DMN_DOC);
        // Existing content must not be rewritten/saved.
        expect(editor.content).toBe(DMN_DOC);
        expect(editor.saveCount).toBe(0);
    });

    it("seeds an empty document with the default DMN diagram before rendering", async () => {
        const { service, editor } = createService("");

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(true);
        expect(editor.content).toContain("DMN/20191111/MODEL");
        expect(editor.saveCount).toBe(1);
        const [msg] = editor.postedOfType<DmnFileQuery>("DmnFileQuery");
        expect(msg.content).toBe(editor.content);
    });

    it("seeds one diagram when two displays of an empty document overlap", async () => {
        const { service, host, editor } = createService("");
        const finishWrite = holdNextWrite(host);

        const firstDisplay = service.display(editor.id);

        expect(await service.display(editor.id)).toBe(false);
        finishWrite(true);
        expect(await firstDisplay).toBe(true);
        expect(editor.postedOfType<DmnFileQuery>("DmnFileQuery")).toHaveLength(1);
    });

    it("does not save or render a seeded diagram into a replacement session", async () => {
        const { service, host, editor } = createService("");
        const finishWrite = holdNextWrite(host);

        const displaying = service.display(editor.id);
        const replacement = host.openEditor("/work/decision.dmn", "");
        finishWrite(true);

        expect(await displaying).toBe(false);
        expect(editor.saveCount + replacement.saveCount).toBe(0);
        expect([...editor.posted, ...replacement.posted]).toEqual([]);
    });

    it("does not render a seeded diagram after the host changed the document", async () => {
        const { service, host, editor } = createService("");
        const finishWrite = holdNextWrite(host);

        const displaying = service.display(editor.id);
        host.store.markHostDocumentUpdated(editor.id);
        finishWrite(true);

        expect(await displaying).toBe(false);
        expect(editor.saveCount).toBe(0);
        expect(editor.posted).toEqual([]);
    });

    it("skips the matching document-change echo while a sync write is pending", async () => {
        const { service, host, editor } = createService("<xml/>");

        // Hold the guard by leaving the sync write pending, then race a display.
        let finishWrite: (applied: boolean) => void = () => {};
        vi.spyOn(host.documents, "write").mockReturnValueOnce(
            new Promise<boolean>((resolve) => {
                finishWrite = resolve;
            }),
        );
        const syncing = service.sync(editor.id, "<xml/>");

        const rendered = await service.display(editor.id);
        expect(rendered).toBe(false);
        expect(editor.posted).toEqual([]);

        finishWrite(true);
        await syncing;
    });

    it("returns false without notifying when the editor is hidden", async () => {
        const { service, host, editor } = createService();
        editor.hidden = true;

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(false);
        expect(host.notifier.errors).toEqual([]);
        expect(host.notifier.logged("error")).toEqual([]);
    });

    it("returns false without notifying when a UserCancelledError surfaces", async () => {
        const { service, host, editor } = createService();
        vi.spyOn(host.documents, "getContent").mockImplementation(() => {
            throw new UserCancelledError();
        });

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(false);
        expect(host.notifier.errors).toEqual([]);
        expect(host.notifier.logged("error")).toEqual([]);
    });

    it("notifies and returns false on an unexpected error", async () => {
        const { service, host, editor } = createService();
        vi.spyOn(host.documents, "getContent").mockImplementation(() => {
            throw new Error("boom");
        });

        const rendered = await service.display(editor.id);

        expect(rendered).toBe(false);
        expect(host.notifier.logged("error")).toEqual(["boom"]);
        expect(host.notifier.errors).toHaveLength(1);
    });
});

describe("DmnModelerService.sync", () => {
    it("writes the content and releases the guard so later renders proceed", async () => {
        const { service, editor } = createService();

        const synced = await service.sync(editor.id, "<xml/>");
        expect(synced).toBe(true);
        expect(editor.content).toBe("<xml/>");

        // Guard must have been released in the `finally`, so display is not skipped.
        await service.display(editor.id);
        expect(editor.postedOfType("DmnFileQuery")).toHaveLength(1);
    });

    it("notifies, returns false, and still releases the guard on a write error", async () => {
        const { service, host, editor } = createService();
        vi.spyOn(host.documents, "write").mockRejectedValueOnce(new Error("disk full"));

        const synced = await service.sync(editor.id, "<xml/>");
        expect(synced).toBe(false);
        expect(host.notifier.logged("error")).toEqual(["disk full"]);
        expect(host.notifier.errors).toHaveLength(1);

        // The failed write must not leave the guard stuck, or rendering would
        // be permanently skipped.
        await service.display(editor.id);
        expect(editor.postedOfType("DmnFileQuery")).toHaveLength(1);
    });

    it("rejects content exported from an older host document revision", async () => {
        const { service, editor } = createService();
        await service.display(editor.id, true);

        const [msg] = editor.postedOfType<DmnFileQuery>("DmnFileQuery");
        expect(msg.documentRevision).toBe(1);
        expect(await service.sync(editor.id, "<stale/>", 0)).toBe(false);
        expect(editor.content).toBe(DMN_DOC);
    });
});

describe("DmnModelerService session lifecycle", () => {
    it("does not skip rendering for a disposed session", async () => {
        const { service, editor } = createService();
        service.disposeSession(editor.id);

        await service.display(editor.id);

        expect(editor.postedOfType("DmnFileQuery")).toHaveLength(1);
    });
});
