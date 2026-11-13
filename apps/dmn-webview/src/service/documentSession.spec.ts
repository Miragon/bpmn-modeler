import { afterEach, describe, expect, it, vi } from "vitest";

import {
    type Command,
    DmnFileQuery,
    DocumentFlushedCommand,
    FlushDocumentQuery,
    type Query,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";
import type { DmnModelerHandle, DmnPendingInputHandle } from "@miragon/dmn-modeler";

import { DmnDocumentSession } from "./documentSession";

function setup() {
    const posted: (Command | Query)[] = [];
    const flushLock = { acquire: vi.fn(), release: vi.fn() };
    const session = new DmnDocumentSession(
        { postMessage: (message) => posted.push(message) },
        flushLock,
    );
    let documentXml = "<before />";
    let heldInput: string | undefined;
    const modeler = {
        loadDiagram: vi.fn(async (xml: string) => {
            documentXml = xml;
            return { warnings: [] };
        }),
        exportDiagram: vi.fn(async () => documentXml),
        hasPendingInput: vi.fn(() => heldInput !== undefined),
        // Applying the held value edits the document, as the editor's modeling command does.
        flushPendingInput: vi.fn(() => {
            if (heldInput === undefined) return;
            documentXml = heldInput;
            heldInput = undefined;
            session.scheduleSync();
        }),
        destroy: vi.fn(),
    } satisfies Partial<DmnModelerHandle> & DmnPendingInputHandle;
    const holdInput = (typed: string): void => {
        heldInput = typed;
    };
    return { session, posted, modeler, holdInput, flushLock };
}

async function openSession(context: ReturnType<typeof setup>, revision: number): Promise<void> {
    context.session.attachModeler(context.modeler as unknown as DmnModelerHandle);
    const opened = context.session.openInitialDocument();
    await context.session.receiveHostFile(new DmnFileQuery("<before />", revision));
    await opened;
}

const flushReplies = (posted: (Command | Query)[]) =>
    posted.filter((message) => message instanceof DocumentFlushedCommand);

describe("DmnDocumentSession input an editor still holds", () => {
    let context: ReturnType<typeof setup> | undefined;

    afterEach(() => {
        context?.session.dispose();
        context = undefined;
    });

    it("counts as a pending sync", async () => {
        context = setup();
        await openSession(context, 6);

        context.holdInput("<typed />");

        expect(context.session.document.hasPendingSync()).toBe(true);
    });

    it("is part of what a save exports", async () => {
        context = setup();
        await openSession(context, 6);
        context.holdInput("<typed />");

        await context.session.respondToFlush(new FlushDocumentQuery(3));

        expect(flushReplies(context.posted)).toEqual([
            new DocumentFlushedCommand(3, "<typed />", "flushed", 6),
        ]);
    });

    it("is synced when the pending sync is drained", async () => {
        context = setup();
        await openSession(context, 6);
        context.holdInput("<typed />");

        await context.session.flushPendingSync();

        expect(context.posted).toContainEqual(new SyncDocumentCommand("<typed />", 6));
    });

    it("leaves a save clean when no editor holds input", async () => {
        context = setup();
        await openSession(context, 6);

        await context.session.respondToFlush(new FlushDocumentQuery(4));

        expect(flushReplies(context.posted)).toEqual([
            new DocumentFlushedCommand(4, undefined, "clean", 6),
        ]);
        expect(context.modeler.flushPendingInput).not.toHaveBeenCalled();
    });

    it("holds the injected lock while a destructive save exports it", async () => {
        context = setup();
        await openSession(context, 6);
        context.holdInput("<typed />");

        await context.session.respondToFlush(new FlushDocumentQuery(5, true));

        expect(flushReplies(context.posted)).toEqual([
            new DocumentFlushedCommand(5, "<typed />", "flushed", 6),
        ]);
        expect(context.flushLock.acquire).toHaveBeenCalledOnce();
        expect(context.flushLock.release).not.toHaveBeenCalled();
    });

    it("holds no input once its modeler is gone", async () => {
        context = setup();
        await openSession(context, 6);
        context.holdInput("<typed />");

        context.session.dispose();

        expect(context.session.document.hasPendingSync()).toBe(false);
        await expect(context.session.flushPendingSync()).resolves.toBeUndefined();
        expect(context.modeler.flushPendingInput).not.toHaveBeenCalled();
    });
});

describe("DmnDocumentSession initial host file", () => {
    it.each([
        ["empty", ""],
        ["whitespace-only", "\n"],
    ])("leaves the modeler alone for %s content", async (_case, content) => {
        const context = setup();
        context.session.attachModeler(context.modeler as unknown as DmnModelerHandle);
        const opened = context.session.openInitialDocument();

        await context.session.receiveHostFile(new DmnFileQuery(content, 1));
        await opened;

        expect(context.modeler.loadDiagram).not.toHaveBeenCalled();
        context.session.dispose();
    });

    it("loads non-blank content unchanged", async () => {
        const context = setup();
        context.session.attachModeler(context.modeler as unknown as DmnModelerHandle);
        const opened = context.session.openInitialDocument();

        await context.session.receiveHostFile(new DmnFileQuery("  <definitions />\n", 1));
        await opened;

        expect(context.modeler.loadDiagram).toHaveBeenCalledWith("  <definitions />\n");
        context.session.dispose();
    });
});
