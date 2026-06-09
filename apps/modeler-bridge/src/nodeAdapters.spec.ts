import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeWorkspace } from "./nodeAdapters";

/**
 * `findFiles` is the picker's one filesystem-backed prompt. These exercise its
 * real `fs.glob` behaviour against a temp tree — brace globs, the `exclude`
 * predicate, and the result cap — since no host (VS Code mock) is involved.
 */
describe("NodeWorkspace.findFiles", () => {
    let root: string;

    beforeAll(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "miranum-find-"));
        await fs.mkdir(join(root, "forms"), { recursive: true });
        // A non-dot directory so the `**/element-templates/**` exclude is actually
        // exercised — fs.glob skips dot-directories by default.
        await fs.mkdir(join(root, "config/element-templates"), { recursive: true });
        await fs.writeFile(join(root, "forms/a.form"), "{}");
        await fs.writeFile(join(root, "forms/b.json"), "{}");
        await fs.writeFile(join(root, "config/element-templates/t.json"), "{}");
    });

    afterAll(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    function workspace(): NodeWorkspace {
        const ws = new NodeWorkspace();
        ws.registerRoot(root);
        return ws;
    }

    it("matches a brace glob across the registered root", async () => {
        const found = await workspace().findFiles("**/*.{form,json}");
        expect(found.sort()).toEqual(
            [
                join(root, "config/element-templates/t.json"),
                join(root, "forms/a.form"),
                join(root, "forms/b.json"),
            ].sort(),
        );
    });

    it("drops paths matching the exclude glob", async () => {
        const found = await workspace().findFiles("**/*.json", "**/element-templates/**");
        expect(found).toEqual([join(root, "forms/b.json")]);
    });

    it("respects the result limit", async () => {
        const found = await workspace().findFiles("**/*.{form,json}", null, 1);
        expect(found).toHaveLength(1);
    });

    it("returns [] when no root is registered", async () => {
        expect(await new NodeWorkspace().findFiles("**/*.json")).toEqual([]);
    });
});

/**
 * Exercises {@link NodeWorkspace.createWatcher} against a real temp directory
 * and real chokidar. The point of this suite is cross-platform confidence: the
 * add/change/unlink → onCreate/onChange/onDelete mapping is the same code on
 * every OS, and the create-after-start case is exactly the Linux/Bun-<1.3.14
 * gap (dynamically-created subdirectories) that motivated the switch away from
 * recursive `fs.watch`.
 */

/** chokidar is ignored by the adapter (`_glob`); any constant documents intent. */
const PATTERN = "**/.camunda/element-templates/**/*.json";

// chokidar needs a moment to arm its watchers; the adapter debounces ~50ms on
// top of that. Timeouts are deliberately generous to keep CI off the flake line.
const SETTLE_MS = 500;
const EVENT_TIMEOUT_MS = 6000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls until `spy` has been invoked, or throws once `EVENT_TIMEOUT_MS` elapses. */
async function waitForCall(spy: ReturnType<typeof vi.fn>): Promise<void> {
    const start = Date.now();
    while (spy.mock.calls.length === 0) {
        if (Date.now() - start > EVENT_TIMEOUT_MS) {
            throw new Error("watcher handler was not called within the timeout");
        }
        await sleep(20);
    }
}

describe("NodeWorkspace.createWatcher", () => {
    let root: string;
    let templatesDir: string;
    let workspace: NodeWorkspace;
    let handle: { dispose(): void } | undefined;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "miranum-watch-"));
        templatesDir = join(root, ".camunda", "element-templates");
        workspace = new NodeWorkspace();
    });

    afterEach(async () => {
        handle?.dispose();
        handle = undefined;
        await fs.rm(root, { recursive: true, force: true });
    });

    it("fires onCreate for a template added in a folder created after the watch starts", async () => {
        const onCreate = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onCreate });
        await sleep(SETTLE_MS);

        // The element-templates folder did not exist when the watch armed — this
        // is the dynamic-subdirectory case Bun's recursive fs.watch misses on Linux.
        await fs.mkdir(templatesDir, { recursive: true });
        await fs.writeFile(join(templatesDir, "task.json"), "[]", "utf8");

        await waitForCall(onCreate);
        expect(onCreate).toHaveBeenCalled();
    }, 15000);

    it("fires onChange when an existing template is modified", async () => {
        await fs.mkdir(templatesDir, { recursive: true });
        const file = join(templatesDir, "task.json");
        await fs.writeFile(file, "[]", "utf8");

        const onChange = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onChange });
        await sleep(SETTLE_MS);

        await fs.writeFile(file, '[{"name":"a"}]', "utf8");

        await waitForCall(onChange);
        expect(onChange).toHaveBeenCalled();
    }, 15000);

    it("fires onDelete when a template is removed", async () => {
        await fs.mkdir(templatesDir, { recursive: true });
        const file = join(templatesDir, "task.json");
        await fs.writeFile(file, "[]", "utf8");

        const onDelete = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onDelete });
        await sleep(SETTLE_MS);

        await fs.rm(file);

        await waitForCall(onDelete);
        expect(onDelete).toHaveBeenCalled();
    }, 15000);

    it("ignores non-json files and json files outside element-templates", async () => {
        const onCreate = vi.fn();
        const onChange = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onCreate, onChange });
        await sleep(SETTLE_MS);

        // JSON under the config folder but not in element-templates → ignored.
        await fs.mkdir(join(root, ".camunda"), { recursive: true });
        await fs.writeFile(join(root, ".camunda", "config.json"), "{}", "utf8");
        // Non-JSON inside element-templates → ignored.
        await fs.mkdir(templatesDir, { recursive: true });
        await fs.writeFile(join(templatesDir, "notes.txt"), "hi", "utf8");

        await sleep(SETTLE_MS);
        expect(onCreate).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
    }, 15000);

    it("stops firing after dispose", async () => {
        const onCreate = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onCreate });
        await sleep(SETTLE_MS);

        handle.dispose();
        handle = undefined;

        await fs.mkdir(templatesDir, { recursive: true });
        await fs.writeFile(join(templatesDir, "task.json"), "[]", "utf8");

        await sleep(SETTLE_MS);
        expect(onCreate).not.toHaveBeenCalled();
    }, 15000);
});
