import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";

import {
    type Command,
    DocumentFlushedCommand,
    ElementTemplateFileQuery,
    FlushDocumentQuery,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";

import { TemplateDocumentSession } from "./documentSession";

let posted: Command[];
let shown: { text: string; origin: string }[];
let flushLock: { acquire: Mock<() => void>; release: Mock<() => void> };
let session: TemplateDocumentSession;

beforeEach(() => {
    vi.useFakeTimers();
    posted = [];
    shown = [];
    flushLock = { acquire: vi.fn(), release: vi.fn() };
    session = new TemplateDocumentSession(
        { postMessage: (message) => posted.push(message) },
        (text, origin) => shown.push({ text, origin }),
        flushLock,
    );
});

afterEach(() => {
    session.dispose();
    vi.useRealTimers();
});

const syncs = () => posted.filter((message) => message instanceof SyncDocumentCommand);

describe("TemplateDocumentSession", () => {
    it("shows the host's file at once and later host edits shortly after", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', undefined, 1));
        expect(shown).toEqual([{ text: '{"id":"a"}', origin: "host" }]);
        expect(session.text).toBe('{"id":"a"}');

        const update = session.receive(new ElementTemplateFileQuery('{"id":"b"}', undefined, 2));
        await vi.advanceTimersByTimeAsync(100);
        await update;
        expect(shown.at(-1)).toEqual({ text: '{"id":"b"}', origin: "host" });
    });

    it("takes every file of a host that sends no revision, like IntelliJ's preview", async () => {
        await session.receive(new ElementTemplateFileQuery("one"));

        const update = session.receive(new ElementTemplateFileQuery("two"));
        await vi.advanceTimersByTimeAsync(200);
        await update;

        expect(session.text).toBe("two");
    });

    it("ignores a file older than the one it shows", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"new"}', undefined, 3));

        await session.receive(new ElementTemplateFileQuery('{"id":"old"}', undefined, 2));
        await vi.advanceTimersByTimeAsync(200);

        expect(session.text).toBe('{"id":"new"}');
    });

    it("shows an edit at once and sends it to the host once editing pauses", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', undefined, 4));

        session.edit('{"id":"ab"}');
        session.edit('{"id":"abc"}');
        expect(shown.at(-1)).toEqual({ text: '{"id":"abc"}', origin: "edit" });
        expect(syncs()).toEqual([]);

        await vi.advanceTimersByTimeAsync(300);
        expect(syncs()).toEqual([new SyncDocumentCommand('{"id":"abc"}', 4)]);
    });

    it("drops a pending edit when the host's file changes first", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', undefined, 1));

        session.edit('{"id":"mine"}');
        const update = session.receive(
            new ElementTemplateFileQuery('{"id":"theirs"}', undefined, 2),
        );
        await vi.advanceTimersByTimeAsync(400);
        await update;

        expect(syncs()).toEqual([]);
        expect(session.text).toBe('{"id":"theirs"}');
    });

    it("hands a pending edit to the host when it saves", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', undefined, 1));
        session.edit('{"id":"saved"}');

        await session.respondToFlush(new FlushDocumentQuery(7, false));

        expect(posted.at(-1)).toEqual(
            new DocumentFlushedCommand(7, '{"id":"saved"}', "flushed", 1),
        );
    });

    it("holds the injected lock while a destructive save exports the pending edit", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', undefined, 1));
        session.edit('{"id":"closing"}');

        await session.respondToFlush(new FlushDocumentQuery(8, true));

        expect(posted.at(-1)).toEqual(
            new DocumentFlushedCommand(8, '{"id":"closing"}', "flushed", 1),
        );
        expect(flushLock.acquire).toHaveBeenCalledOnce();
        expect(flushLock.release).not.toHaveBeenCalled();
    });

    it("tells the host it has nothing to save before the file arrived", async () => {
        await session.respondToFlush(new FlushDocumentQuery(1, false));

        expect(posted).toEqual([new DocumentFlushedCommand(1, undefined, "unavailable")]);
    });
});
