import { describe, expect, it, vi } from "vitest";

import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { DmnModelerService } from "../../modeler/dmn/service/DmnModelerService";
import { createTestHost } from "../../testing";
import { DocumentRenderParticipant } from "./DocumentRenderParticipant";

const DMN = '<definitions id="first"/>';
const EDITED_DMN = '<definitions id="edited"/>';

function createDmnHost() {
    const host = createTestHost();
    const service = new DmnModelerService(host.store, host.documents, host.notifier);
    const participant = new DocumentRenderParticipant(service, ".dmn", host.notifier);
    const open = (path: string) => host.openSession(path, [participant], { content: DMN });
    return { host, service, open };
}

async function openDmnSession(path = "/work/decision.dmn") {
    const { host, service, open } = createDmnHost();
    const editor = await open(path);
    return { host, service, editor };
}

describe("DocumentRenderParticipant", () => {
    it("re-renders the document with a new revision after an external edit", async () => {
        const { editor } = await openDmnSession();

        editor.changeDocument(EDITED_DMN);

        await vi.waitFor(() =>
            expect(editor.postedOfType<DmnFileQuery>("DmnFileQuery")).toEqual([
                new DmnFileQuery(EDITED_DMN, 1),
            ]),
        );
    });

    it("ignores a change to a document of another type", async () => {
        const { editor } = await openDmnSession("/work/decision.bpmn");

        editor.changeDocument(EDITED_DMN);
        await Promise.resolve();

        expect(editor.posted).toEqual([]);
    });

    it("ignores an edit to another open document of the same type", async () => {
        const { open } = createDmnHost();
        const editor = await open("/work/decision.dmn");
        const other = await open("/work/other.dmn");

        other.changeDocument(EDITED_DMN);

        await vi.waitFor(() =>
            expect(other.postedOfType<DmnFileQuery>("DmnFileQuery")).toHaveLength(1),
        );
        expect(editor.posted).toEqual([]);
    });

    it("does not echo the core's own write of a webview edit back to the webview", async () => {
        const { host, service, editor } = await openDmnSession();

        expect(await service.sync(editor.id, EDITED_DMN, 0)).toBe(true);

        expect(editor.content).toBe(EDITED_DMN);
        expect(editor.posted).toEqual([]);
        expect(host.store.currentHostDocumentRevision(editor.id)).toBe(0);
    });

    it("registers the document session on open and disposes it on close", async () => {
        const host = createTestHost();
        const service = {
            registerSession: vi.fn(),
            disposeSession: vi.fn(),
            display: vi.fn(),
            sync: vi.fn(),
        };
        const editor = await host.openSession("/work/decision.dmn", [
            new DocumentRenderParticipant(service, ".dmn", host.notifier),
        ]);

        expect(service.registerSession).toHaveBeenCalledWith(editor.id);

        editor.dispose();

        expect(service.disposeSession).toHaveBeenCalledWith(editor.id);
    });
});
