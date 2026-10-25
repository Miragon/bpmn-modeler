import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DocumentFlushedCommand,
    FlushDocumentQuery,
    LogErrorCommand,
    SyncDocumentCommand,
} from "./messages";
import { type DocumentSyncSurface, WebviewDocumentSync } from "./webviewDocumentSync";

function createSync(surface: Partial<DocumentSyncSurface> = {}) {
    const posted: unknown[] = [];
    const flushLock = { acquire: vi.fn(), release: vi.fn() };
    let ready = true;
    const sync = new WebviewDocumentSync(
        { postMessage: (message) => posted.push(message) },
        {
            surface: {
                importDocument: vi.fn().mockResolvedValue(undefined),
                exportDocument: vi.fn().mockResolvedValue("<exported/>"),
                ...surface,
            },
            flushLock,
            isReady: () => ready,
        },
    );
    return {
        sync,
        posted,
        flushLock,
        setReady: (value: boolean) => (ready = value),
    };
}

describe("WebviewDocumentSync", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("posts one sync with the imported host revision after the debounce", async () => {
        const { sync, posted } = createSync();
        sync.receive(4);
        await sync.importNow("<host/>", 4);

        sync.scheduleSync();
        sync.scheduleSync();
        await vi.advanceTimersByTimeAsync(300);

        expect(posted).toEqual([new SyncDocumentCommand("<exported/>", 4)]);
    });

    it("drops a pending sync when the host pushes an update", async () => {
        const { sync, posted } = createSync();
        sync.receive(1);

        sync.scheduleSync();
        expect(sync.receive(2)).toBe("update");
        await vi.advanceTimersByTimeAsync(300);

        expect(posted).toEqual([]);
        expect(sync.hasPendingSync()).toBe(false);
    });

    it("does not post an export a host push overtook", async () => {
        let finishExport: (content: string) => void = () => {};
        const { sync, posted } = createSync({
            exportDocument: () =>
                new Promise<string>((resolve) => {
                    finishExport = resolve;
                }),
        });
        sync.receive(1);

        sync.scheduleSync();
        await vi.advanceTimersByTimeAsync(300);
        sync.receive(2);
        finishExport("<stale/>");
        await vi.runAllTimersAsync();

        expect(posted).toEqual([]);
    });

    it("reports a failed export instead of rejecting into the modeler's event bus", async () => {
        const { sync, posted } = createSync({
            exportDocument: () => Promise.reject(new Error("export broke")),
        });

        sync.scheduleSync();
        await vi.advanceTimersByTimeAsync(300);

        expect(posted).toHaveLength(1);
        expect((posted[0] as LogErrorCommand).message).toBe(
            "Failed to sync diagram changes: export broke",
        );
    });

    it("keeps the represented revision when a newer push overtook an import", async () => {
        const { sync } = createSync();
        sync.receive(1);
        sync.receive(2);

        await sync.importNow("<first/>", 1);

        expect(sync.documentRevision()).toBe(0);
    });

    it("imports debounced host updates in order and drains them on demand", async () => {
        const imported: (string | undefined)[] = [];
        const { sync } = createSync({
            importDocument: async (content) => {
                imported.push(content);
            },
        });
        sync.receive(1);
        sync.receive(2);

        void sync.importDebounced("<a/>", 1);
        void sync.importDebounced("<b/>", 2);
        expect(sync.hasPendingHostUpdate()).toBe(true);
        await sync.flushPendingImports(() => undefined);

        expect(imported).toEqual(["<b/>"]);
        expect(sync.documentRevision()).toBe(2);
        expect(sync.hasPendingHostUpdate()).toBe(false);
    });

    it("reports a failed debounced import and keeps draining", async () => {
        const { sync } = createSync({
            importDocument: () => Promise.reject(new Error("bad xml")),
        });
        const errors: unknown[] = [];

        sync.importDebounced("<broken/>", 1).catch(() => undefined);
        await sync.flushPendingImports((error) => errors.push(error));

        expect(errors).toEqual([new Error("bad xml")]);
    });

    it("drains the pending sync under the flush lock before answering a destructive flush", async () => {
        const { sync, posted, flushLock } = createSync();
        sync.scheduleSync();

        await sync.respondToFlush(new FlushDocumentQuery(7, true));

        expect(flushLock.acquire).toHaveBeenCalled();
        expect(posted).toEqual([
            new SyncDocumentCommand("<exported/>", 0),
            new DocumentFlushedCommand(7, "<exported/>", "flushed", 0),
        ]);
    });

    it("reports itself unavailable to a flush before the modeler is ready", async () => {
        const { sync, posted, setReady } = createSync();
        setReady(false);

        await sync.respondToFlush(new FlushDocumentQuery(8));

        expect(posted).toEqual([new DocumentFlushedCommand(8, undefined, "unavailable")]);
    });

    it("stops posting and releases the flush lock once disposed", async () => {
        const { sync, posted, flushLock } = createSync();
        sync.scheduleSync();

        sync.dispose();
        await vi.advanceTimersByTimeAsync(300);

        expect(posted).toEqual([]);
        expect(flushLock.release).toHaveBeenCalled();
    });
});
