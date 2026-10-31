import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryWorkspace } from "../../testing";
import { CreatedFolderWalks } from "./CreatedFolderWalks";

const isBpmnFile = (path: string) => path.endsWith(".bpmn");

function setup() {
    const workspace = new InMemoryWorkspace(["/work"], {
        "/work/a/order.bpmn": "",
        "/work/a/b/ship.bpmn": "",
        "/work/a/b/notes.md": "",
        "/work/c/pay.bpmn": "",
    });
    const readDirectory = vi.spyOn(workspace, "readDirectory");
    const found: string[][] = [];
    const walks = new CreatedFolderWalks(workspace, isBpmnFile, (files) => {
        found.push(files);
    });
    return { walks, found, readDirectory };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("CreatedFolderWalks", () => {
    it("walks the outermost folders of a burst once", async () => {
        const { walks, found, readDirectory } = setup();

        const walked = Promise.all([
            walks.add("/work/a/b"),
            walks.add("/work/a"),
            walks.add("/work/c"),
        ]);
        await vi.runAllTimersAsync();
        await walked;

        expect(found).toEqual([["/work/a/order.bpmn", "/work/a/b/ship.bpmn", "/work/c/pay.bpmn"]]);
        expect(readDirectory.mock.calls.map(([path]) => path)).toEqual([
            "/work/a",
            "/work/c",
            "/work/a/b",
        ]);
    });

    it("walks a folder created after a burst in the next one", async () => {
        const { walks, found } = setup();
        const first = walks.add("/work/a/b");
        await vi.runAllTimersAsync();
        await first;

        const second = walks.add("/work/a/b");
        await vi.runAllTimersAsync();
        await second;

        expect(found).toEqual([["/work/a/b/ship.bpmn"], ["/work/a/b/ship.bpmn"]]);
    });

    it("hands on nothing when disposed during a walk", async () => {
        const { walks, found, readDirectory } = setup();
        let finishRead!: () => void;
        readDirectory.mockImplementationOnce(
            () => new Promise((resolve) => (finishRead = () => resolve([["x.bpmn", "file"]]))),
        );
        const pending = walks.add("/work/a");
        await vi.runAllTimersAsync();

        walks.dispose();
        finishRead();
        await pending;

        expect(found).toEqual([]);
    });

    it("walks nothing once disposed", async () => {
        const { walks, found, readDirectory } = setup();
        const pending = walks.add("/work/a");

        walks.dispose();
        await pending;
        await walks.add("/work/c");
        await vi.runAllTimersAsync();

        expect(found).toEqual([]);
        expect(readDirectory).not.toHaveBeenCalled();
    });
});
