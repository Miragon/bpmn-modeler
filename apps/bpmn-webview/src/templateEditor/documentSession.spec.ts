import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
let session: TemplateDocumentSession;

beforeEach(() => {
    vi.useFakeTimers();
    posted = [];
    shown = [];
    session = new TemplateDocumentSession(
        { postMessage: (message) => posted.push(message) },
        (text, origin) => shown.push({ text, origin }),
    );
});

afterEach(() => {
    session.dispose();
    vi.useRealTimers();
});

const syncs = () => posted.filter((message) => message instanceof SyncDocumentCommand);

describe("TemplateDocumentSession", () => {
    it("shows the host's file at once and later host edits shortly after", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', 1));
        expect(shown).toEqual([{ text: '{"id":"a"}', origin: "host" }]);
        expect(session.text).toBe('{"id":"a"}');

        const update = session.receive(new ElementTemplateFileQuery('{"id":"b"}', 2));
        await vi.advanceTimersByTimeAsync(100);
        await update;
        expect(shown.at(-1)).toEqual({ text: '{"id":"b"}', origin: "host" });
    });

    it("ignores a file older than the one it shows", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"new"}', 3));

        await session.receive(new ElementTemplateFileQuery('{"id":"old"}', 2));
        await vi.advanceTimersByTimeAsync(200);

        expect(session.text).toBe('{"id":"new"}');
    });

    it("shows an edit at once and sends it to the host once editing pauses", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', 4));

        session.edit('{"id":"ab"}');
        session.edit('{"id":"abc"}');
        expect(shown.at(-1)).toEqual({ text: '{"id":"abc"}', origin: "edit" });
        expect(syncs()).toEqual([]);

        await vi.advanceTimersByTimeAsync(300);
        expect(syncs()).toEqual([new SyncDocumentCommand('{"id":"abc"}', 4)]);
    });

    it("drops a pending edit when the host's file changes first", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', 1));

        session.edit('{"id":"mine"}');
        const update = session.receive(new ElementTemplateFileQuery('{"id":"theirs"}', 2));
        await vi.advanceTimersByTimeAsync(400);
        await update;

        expect(syncs()).toEqual([]);
        expect(session.text).toBe('{"id":"theirs"}');
    });

    it("hands a pending edit to the host when it saves", async () => {
        await session.receive(new ElementTemplateFileQuery('{"id":"a"}', 1));
        session.edit('{"id":"saved"}');

        await session.respondToFlush(new FlushDocumentQuery(7, false));

        expect(posted.at(-1)).toEqual(
            new DocumentFlushedCommand(7, '{"id":"saved"}', "flushed", 1),
        );
    });

    it("tells the host it has nothing to save before the file arrived", async () => {
        await session.respondToFlush(new FlushDocumentQuery(1, false));

        expect(posted).toEqual([new DocumentFlushedCommand(1, undefined, "unavailable")]);
    });
});
