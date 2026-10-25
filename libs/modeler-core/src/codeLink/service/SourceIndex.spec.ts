import { describe, expect, it, vi } from "vitest";

import { InMemoryWorkspace, RecordingNotifier } from "../../testing";
import { SourceIndex } from "./SourceIndex";

const FOLDER = "/ws";
const DOC = "/ws/order.bpmn";
const SECOND_DOC = "/ws/sub/invoice.bpmn";
const WORKER = "/ws/src/Worker.java";
const OTHER = "/ws/src/pkg/Other.java";

function createIndex(files: Record<string, string>, folders = [FOLDER]) {
    const workspace = new InMemoryWorkspace(folders, files);
    const findFiles = vi.spyOn(workspace, "findFiles");
    const readFile = vi.spyOn(workspace, "readFile");
    const notifier = new RecordingNotifier();
    const index = new SourceIndex(workspace, notifier);
    return {
        index,
        workspace,
        watchers: workspace.watchers,
        findFiles,
        readFile,
        notifier,
        readsOf: (path: string) => readFile.mock.calls.filter(([read]) => read === path),
    };
}

async function scan(index: SourceIndex, editorId: string, document: string): Promise<string[]> {
    const sources = index.sourcesFor(editorId, document)!;
    const paths = (await sources.listSources())!;
    await Promise.all(paths.map((path) => sources.inspect(path, false)));
    return paths;
}

describe("SourceIndex", () => {
    it("shares one listing and one read per file between editors of the same folders", async () => {
        const { index, watchers, findFiles, readsOf } = createIndex({
            [WORKER]: `@JobWorker(type = "pay")`,
            [OTHER]: "class Other {}",
        });

        await scan(index, "editor1", DOC);
        const sources = index.sourcesFor("editor2", SECOND_DOC)!;
        const paths = await sources.listSources();
        const worker = await sources.inspect(WORKER, false);

        expect(paths).toEqual([WORKER, OTHER]);
        expect(worker?.facts.implementsLiteral("pay")).toBe(true);
        expect(findFiles).toHaveBeenCalledOnce();
        expect(readsOf(WORKER)).toHaveLength(1);
        expect(watchers.map(({ root, glob }) => [root, glob])).toEqual([[FOLDER, "**/*"]]);
    });

    it("re-reads only a file that changed", async () => {
        const { index, workspace, readsOf } = createIndex({
            [WORKER]: `"pay"`,
            [OTHER]: "class Other {}",
        });
        await scan(index, "editor1", DOC);

        await workspace.writeFile(WORKER, `"refund"`);
        await scan(index, "editor1", DOC);
        const worker = await index.sourcesFor("editor1", DOC)!.inspect(WORKER, false);

        expect(readsOf(WORKER)).toHaveLength(2);
        expect(readsOf(OTHER)).toHaveLength(1);
        expect(worker?.facts.implementsLiteral("refund")).toBe(true);
    });

    it("lists again after a new source file without re-reading the known ones", async () => {
        const created = "/ws/src/Created.java";
        const { index, workspace, findFiles, readsOf } = createIndex({ [WORKER]: `"pay"` });
        await scan(index, "editor1", DOC);

        await workspace.writeFile(created, `"new"`);
        const paths = await scan(index, "editor1", DOC);

        expect(paths).toEqual([WORKER, created]);
        expect(findFiles).toHaveBeenCalledTimes(2);
        expect(readsOf(WORKER)).toHaveLength(1);
    });

    it("treats a create event for a listed file as a change", async () => {
        const { index, watchers, findFiles, readsOf } = createIndex({ [WORKER]: `"pay"` });
        await scan(index, "editor1", DOC);

        watchers[0].handlers.onCreate?.(WORKER);
        await scan(index, "editor1", DOC);

        expect(findFiles).toHaveBeenCalledOnce();
        expect(readsOf(WORKER)).toHaveLength(2);
    });

    it("lists again after a delete and reads the files of a re-created folder afresh", async () => {
        const { index, workspace, watchers, findFiles, readsOf } = createIndex({
            [WORKER]: `"pay"`,
            [OTHER]: `"old"`,
            "/ws/src/Kept.java": "class Kept {}",
        });
        await scan(index, "editor1", DOC);

        workspace.deleteFile(WORKER);
        // A folder replaced as a whole reports only the folder's own events.
        watchers[0].handlers.onDelete?.("/ws/src/pkg");
        workspace.files.set(OTHER, `"new"`);
        watchers[0].handlers.onCreate?.("/ws/src/pkg");
        const paths = await scan(index, "editor1", DOC);
        const other = await index.sourcesFor("editor1", DOC)!.inspect(OTHER, false);

        expect(paths).toEqual([OTHER, "/ws/src/Kept.java"]);
        expect(findFiles).toHaveBeenCalledTimes(2);
        expect(other?.facts.implementsLiteral("new")).toBe(true);
        expect(readsOf("/ws/src/Kept.java")).toHaveLength(1);
    });

    it("does not keep a read that a change overtook", async () => {
        const { index, workspace, readFile, readsOf } = createIndex({ [WORKER]: `"pay"` });
        let releaseRead!: (content: string) => void;
        readFile.mockImplementationOnce(
            () =>
                new Promise<string>((resolve) => {
                    releaseRead = resolve;
                }),
        );
        const sources = index.sourcesFor("editor1", DOC)!;

        const staleRead = sources.inspect(WORKER, false);
        await workspace.writeFile(WORKER, `"pay"`);
        releaseRead(`"stale"`);
        await staleRead;
        const fresh = await sources.inspect(WORKER, false);

        expect(readsOf(WORKER)).toHaveLength(2);
        expect(fresh?.facts.implementsLiteral("pay")).toBe(true);
    });

    it("matches watcher paths that use backslash separators", async () => {
        const folder = "C:/ws";
        const file = "C:/ws/src/Worker.java";
        const { index, watchers, readsOf } = createIndex({ [file]: `"pay"` }, [folder]);
        await scan(index, "editor1", "C:/ws/order.bpmn");

        watchers[0].handlers.onChange?.("C:\\ws\\src\\Worker.java");
        await scan(index, "editor1", "C:/ws/order.bpmn");

        expect(readsOf(file)).toHaveLength(2);
    });

    it("judges excluded directories relative to the watched folder", async () => {
        const file = "/home/build/ws/src/Worker.java";
        const { index, workspace, readsOf } = createIndex({ [file]: `"pay"` }, ["/home/build/ws"]);
        const sources = index.sourcesFor("editor1", "/home/build/ws/order.bpmn")!;
        await sources.inspect(file, false);

        await workspace.writeFile(file, `"pay"`);
        await sources.inspect(file, false);

        expect(readsOf(file)).toHaveLength(2);
    });

    it("ignores changes inside excluded directories", async () => {
        const { index, workspace, findFiles } = createIndex({ [WORKER]: `"pay"` });
        await scan(index, "editor1", DOC);

        await workspace.writeFile("/ws/target/classes/Generated.java", "class Generated {}");
        await scan(index, "editor1", DOC);

        expect(findFiles).toHaveBeenCalledOnce();
    });

    it("returns the content only when asked and never keeps it", async () => {
        const { index } = createIndex({ [WORKER]: `"pay"` });
        const sources = index.sourcesFor("editor1", DOC)!;

        const withoutContent = await sources.inspect(WORKER, false);
        const withContent = await sources.inspect(WORKER, true);

        expect(withoutContent?.content).toBeUndefined();
        expect(withContent?.content).toBe(`"pay"`);
    });

    it("disposes the watchers with the last editor", async () => {
        const { index, watchers } = createIndex({ [WORKER]: `"pay"` });
        index.sourcesFor("editor1", DOC);
        index.sourcesFor("editor2", SECOND_DOC);

        index.release("editor1");
        expect(watchers[0].disposed).toBe(false);

        index.release("editor2");
        expect(watchers[0].disposed).toBe(true);
    });

    it("moves an editor to a new index when the workspace folders change", async () => {
        const { index, workspace, watchers } = createIndex({ [WORKER]: `"pay"` });
        const before = index.sourcesFor("editor1", DOC);

        vi.spyOn(workspace, "getWorkspaceFolderPaths").mockReturnValue([FOLDER, "/other"]);
        const after = index.sourcesFor("editor1", DOC);

        expect(after).not.toBe(before);
        expect(watchers[0].disposed).toBe(true);
        expect(watchers.map((watcher) => watcher.root)).toEqual([FOLDER, FOLDER, "/other"]);
    });

    it("shares nothing for a document outside every workspace folder", () => {
        const { index, watchers } = createIndex({ [WORKER]: `"pay"` });

        expect(index.sourcesFor("editor1", "/loose/diagram.bpmn")).toBeUndefined();
        expect(watchers).toEqual([]);
    });

    it("falls back to unshared searches when the folders cannot be watched", () => {
        const { index, workspace, notifier } = createIndex({ [WORKER]: `"pay"` });
        vi.spyOn(workspace, "createWatcher").mockImplementationOnce(() => {
            throw new Error("watch limit reached");
        });

        expect(index.sourcesFor("editor1", DOC)).toBeUndefined();
        expect(notifier.logged("warning")).toEqual([
            expect.stringContaining("watch limit reached"),
        ]);
    });
});
