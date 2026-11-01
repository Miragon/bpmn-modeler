import { describe, expect, it } from "vitest";

import { WatchedChange, watchedChangeOf } from "./watchedFiles";
import { WatcherEventKind } from "./watcherEvents";

const ROOT = "/home/build/work";
const isBpmnFile = (path: string) => path.endsWith(".bpmn");

describe("watchedChangeOf", () => {
    it.each<{
        behaviour: string;
        event: WatcherEventKind;
        path: string;
        change: WatchedChange;
    }>([
        {
            behaviour: "reads a create of a watched file as the file's",
            event: "create",
            path: `${ROOT}/models/order.bpmn`,
            change: "file",
        },
        {
            behaviour: "reads a change of a watched file as the file's",
            event: "change",
            path: `${ROOT}/order.bpmn`,
            change: "file",
        },
        {
            behaviour: "reads a delete of a watched file as the file's",
            event: "delete",
            path: `${ROOT}/order.bpmn`,
            change: "file",
        },
        {
            behaviour: "reads a create of another path as a folder created",
            event: "create",
            path: `${ROOT}/models`,
            change: "folderCreated",
        },
        {
            behaviour: "reads a delete of another path as a folder deleted",
            event: "delete",
            path: `${ROOT}/models`,
            change: "folderDeleted",
        },
        {
            behaviour: "ignores a change of another path",
            event: "change",
            path: `${ROOT}/models`,
            change: "unrelated",
        },
        {
            behaviour: "reads a delete of the watched root as a folder deleted",
            event: "delete",
            path: ROOT,
            change: "folderDeleted",
        },
        {
            behaviour: "ignores a watched file inside an excluded directory below the root",
            event: "create",
            path: `${ROOT}/target/order.bpmn`,
            change: "unrelated",
        },
        {
            behaviour: "ignores an excluded directory below the root",
            event: "delete",
            path: `${ROOT}/node_modules`,
            change: "unrelated",
        },
        {
            behaviour: "ignores a watched file inside a dot-folder below the root",
            event: "create",
            path: `${ROOT}/.history/order.bpmn`,
            change: "unrelated",
        },
        {
            behaviour: "ignores a dot-folder created below the root",
            event: "create",
            path: `${ROOT}/.history`,
            change: "unrelated",
        },
        {
            behaviour: "reads a change of a watched dot-file as the file's",
            event: "change",
            path: `${ROOT}/.order.bpmn`,
            change: "file",
        },
    ])("$behaviour", ({ event, path, change }) => {
        expect(watchedChangeOf(event, path, ROOT, isBpmnFile)).toBe(change);
    });
});
