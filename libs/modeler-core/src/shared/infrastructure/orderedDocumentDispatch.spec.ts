import { describe, expect, it } from "vitest";

import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../testing";
import { dispatchInDocumentOrder } from "./orderedDocumentDispatch";

const EDITOR = "file:///w/a.bpmn";

function setup() {
    const { store, openEditor } = createTestHost();
    const handle = openEditor("/w/a.bpmn");
    const written: string[] = [];
    const fire = (message: Command, beforeWrite: Promise<void> = Promise.resolve()) =>
        dispatchInDocumentOrder(store, EDITOR, handle, message, async () => {
            await beforeWrite;
            if (message instanceof SyncDocumentCommand) {
                if (!store.isHostDocumentRevisionCurrent(EDITOR, message.documentRevision)) return;
                written.push(message.content);
                handle.content = message.content;
            } else {
                written.push(message.type);
            }
        });
    return { store, handle, written, fire };
}

function sync(content: string, documentRevision = 0): SyncDocumentCommand {
    return new SyncDocumentCommand(content, documentRevision);
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    return { promise, resolve };
}

describe("dispatchInDocumentOrder", () => {
    it("applies a newer sync only after a slower earlier sync finished", async () => {
        const { written, fire } = setup();
        const slowWrite = deferred();

        const first = fire(sync("first"), slowWrite.promise);
        const second = fire(sync("second"));
        await Promise.resolve();
        expect(written).toEqual([]);

        slowWrite.resolve();
        await Promise.all([first, second]);

        expect(written).toEqual(["first", "second"]);
    });

    it("drops a sync based on an outdated host revision", async () => {
        const { store, written, fire } = setup();
        store.markHostDocumentUpdated(EDITOR);

        await fire(sync("stale", 0));
        await fire(sync("fresh", 1));

        expect(written).toEqual(["fresh"]);
    });

    it("does not record syncs whose revision went stale while they waited", async () => {
        const { store, handle, fire } = setup();
        const slowWrite = deferred();

        const first = fire(sync("first"), slowWrite.promise);
        const queued = fire(sync("queued"));
        store.markHostDocumentUpdated(EDITOR);
        handle.content = "external";
        slowWrite.resolve();
        await Promise.all([first, queued]);

        expect(store.isLatestDocumentSyncApplied(EDITOR, handle)).toBe(true);
    });

    it("dispatches other messages without waiting for queued syncs", async () => {
        const { written, fire } = setup();
        const slowWrite = deferred();

        const pendingSync = fire(sync("first"), slowWrite.promise);
        await fire({ type: "GetBpmnFileCommand" } as Command);

        expect(written).toEqual(["GetBpmnFileCommand"]);
        slowWrite.resolve();
        await pendingSync;
    });
});
