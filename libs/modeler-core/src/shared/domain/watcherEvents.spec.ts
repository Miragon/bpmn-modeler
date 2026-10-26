import { describe, expect, it } from "vitest";

import { coalesceWatcherEvents, WatcherEventKind } from "./watcherEvents";

describe("coalesceWatcherEvents", () => {
    it.each<{
        behaviour: string;
        pending: WatcherEventKind | undefined;
        next: WatcherEventKind;
        delivered: WatcherEventKind;
    }>([
        {
            behaviour: "delivers the first event of a burst as it is",
            pending: undefined,
            next: "change",
            delivered: "change",
        },
        {
            behaviour: "keeps a new file created when a change follows",
            pending: "create",
            next: "change",
            delivered: "create",
        },
        {
            behaviour: "reports a file created and deleted in one burst as deleted",
            pending: "create",
            next: "delete",
            delivered: "delete",
        },
        {
            behaviour: "keeps repeated creates one create",
            pending: "create",
            next: "create",
            delivered: "create",
        },
        {
            behaviour: "reports a file deleted and created again as changed",
            pending: "delete",
            next: "create",
            delivered: "change",
        },
        {
            behaviour: "reports a changed file deleted afterwards as deleted",
            pending: "change",
            next: "delete",
            delivered: "delete",
        },
        {
            behaviour: "reports a create after a change as created",
            pending: "change",
            next: "create",
            delivered: "create",
        },
        {
            behaviour: "reports a change after a delete as changed",
            pending: "delete",
            next: "change",
            delivered: "change",
        },
        {
            behaviour: "keeps repeated changes one change",
            pending: "change",
            next: "change",
            delivered: "change",
        },
        {
            behaviour: "keeps repeated deletes one delete",
            pending: "delete",
            next: "delete",
            delivered: "delete",
        },
    ])("$behaviour", ({ pending, next, delivered }) => {
        expect(coalesceWatcherEvents(pending, next)).toBe(delivered);
    });
});
