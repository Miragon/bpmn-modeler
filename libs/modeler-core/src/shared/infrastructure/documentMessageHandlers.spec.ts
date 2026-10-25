import { describe, expect, it, vi } from "vitest";

import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { RecordingNotifier } from "../../testing";
import { displayDocumentHandler, syncDocumentHandler } from "./documentMessageHandlers";

const EDITOR = "file:///work/decision.dmn";
const GET_FILE: Command = { type: "GetDmnFileCommand" } as Command;

function createService(rendered = true) {
    return {
        registerSession: vi.fn(),
        disposeSession: vi.fn(),
        display: vi.fn().mockResolvedValue(rendered),
        sync: vi.fn().mockResolvedValue(true),
    };
}

describe("displayDocumentHandler", () => {
    it("logs readiness only when the document actually rendered", async () => {
        const service = createService();
        const notifier = new RecordingNotifier();

        await displayDocumentHandler(service, notifier, "Dmn modeler is ready")(GET_FILE, EDITOR);

        expect(service.display).toHaveBeenCalledWith(EDITOR);
        expect(notifier.logged("debug")).toEqual(["Dmn modeler is ready"]);
    });

    it("does not log when rendering was skipped", async () => {
        const notifier = new RecordingNotifier();

        await displayDocumentHandler(createService(false), notifier, "ready")(GET_FILE, EDITOR);

        expect(notifier.logs).toEqual([]);
    });
});

describe("syncDocumentHandler", () => {
    it("forwards the editor id, content and document revision to sync", async () => {
        const service = createService();

        await syncDocumentHandler(service)(new SyncDocumentCommand("<dmn/>", 3), EDITOR);

        expect(service.sync).toHaveBeenCalledWith(EDITOR, "<dmn/>", 3);
    });
});
