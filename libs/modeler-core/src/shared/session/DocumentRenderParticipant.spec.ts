import { describe, expect, it, vi } from "vitest";

import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { DmnModelerService } from "../../modeler/dmn/service/DmnModelerService";
import { createTestHost } from "../../testing";
import { DocumentRenderParticipant } from "./DocumentRenderParticipant";

const DMN = '<definitions id="first"/>';
const EDITED_DMN = '<definitions id="edited"/>';

async function openDmnSession(path = "/work/decision.dmn") {
    const host = createTestHost();
    const service = new DmnModelerService(host.store, host.documents, host.notifier);
    const editor = await host.openSession(
        path,
        [new DocumentRenderParticipant(service, ".dmn", host.notifier)],
        { content: DMN },
    );
    return { host, editor };
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
