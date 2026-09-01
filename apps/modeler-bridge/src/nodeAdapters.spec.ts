import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { NoWorkspaceFolderFoundError } from "@miragon/bpmn-modeler-core";

import { NodeWorkspace } from "./nodeAdapters";

/**
 * `findFiles` is the picker's one filesystem-backed prompt. These exercise its
 * real `fs.glob` behaviour against a temp tree — brace globs, the `exclude`
 * predicate, and the result cap — since no host (VS Code mock) is involved.
 */
describe("NodeWorkspace.findFiles", () => {
    let root: string;

    beforeAll(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-find-"));
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
 * `deleteDirectory` backs the marketplace-cache prune. It must recursively
 * remove a slot and, crucially, tolerate a missing path (a slot a prior run
 * already deleted) rather than throw — exercised against a real temp tree.
 */
describe("NodeWorkspace.deleteDirectory", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-del-"));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("recursively removes a populated directory", async () => {
        const slot = join(root, "acme");
        await fs.mkdir(join(slot, "0/element-templates"), { recursive: true });
        await fs.writeFile(join(slot, "0/element-templates/t.json"), "{}");

        await new NodeWorkspace().deleteDirectory(slot);

        await expect(fs.access(slot)).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("is a no-op for a missing path", async () => {
        await expect(
            new NodeWorkspace().deleteDirectory(join(root, "never-cached")),
        ).resolves.toBeUndefined();
    });
});

/**
 * The three workspace-folder methods the navigation locator depends on. These
 * were once unimplemented stubs that threw — the path that runs
 * `findWorkspaceFolderForDocument` (loose-file detection) and
 * `getDocumentDirectory` (fs-walk root) must work even when the host registers
 * a workspace root, since the locator queries them up front. The
 * `getWorkspaceFolderForDocument` throw-variant is still load-bearing for
 * `ArtifactService.getWorkspaceRoot`, so its behaviour is pinned here too.
 */
describe("NodeWorkspace folder lookups", () => {
    let root: string;

    beforeAll(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-folder-"));
    });

    afterAll(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    function workspace(rootPath = root): NodeWorkspace {
        const ws = new NodeWorkspace();
        ws.registerRoot(rootPath);
        return ws;
    }

    it("getWorkspaceFolderPaths reflects every registered root", () => {
        const ws = new NodeWorkspace();
        ws.registerRoot("/tmp/a");
        ws.registerRoot("/tmp/b");
        expect(ws.getWorkspaceFolderPaths().sort()).toEqual(["/tmp/a", "/tmp/b"]);
    });

    it("keeps a root registered until its final claim is released", () => {
        const ws = new NodeWorkspace();
        ws.registerRoot("/tmp/a");
        ws.registerRoot("/tmp/a");

        ws.unregisterRoot("/tmp/a");
        expect(ws.getWorkspaceFolderPaths()).toEqual(["/tmp/a"]);
        ws.unregisterRoot("/tmp/a");
        expect(ws.getWorkspaceFolderPaths()).toEqual([]);
    });

    it("getWorkspaceFolderPaths is empty when nothing is registered", () => {
        expect(new NodeWorkspace().getWorkspaceFolderPaths()).toEqual([]);
    });

    it("findWorkspaceFolderForDocument returns the enclosing root for an inside path", () => {
        const ws = workspace();
        expect(ws.findWorkspaceFolderForDocument(join(root, "sub/file.bpmn"))).toBe(root);
    });

    it("findWorkspaceFolderForDocument returns undefined for an outside path", () => {
        const ws = workspace();
        // A sibling temp dir guarantees no prefix overlap with `root`.
        expect(ws.findWorkspaceFolderForDocument("/var/empty/file.bpmn")).toBeUndefined();
    });

    it("findWorkspaceFolderForDocument preserves the file:// scheme of the input", () => {
        const ws = workspace();
        expect(ws.findWorkspaceFolderForDocument(`file://${root}/file.bpmn`)).toBe(
            `file://${root}`,
        );
    });

    it("getWorkspaceFolderForDocument still throws when no root encloses the document", () => {
        const ws = workspace();
        // ArtifactService relies on this exact error class to trigger its git-root
        // → doc-dir fallback chain; loosening the throw would silently break it.
        expect(() => ws.getWorkspaceFolderForDocument("/var/empty/file.bpmn")).toThrow(
            NoWorkspaceFolderFoundError,
        );
    });

    it("getDocumentDirectory returns the parent of a clean path", () => {
        const ws = new NodeWorkspace();
        expect(ws.getDocumentDirectory("/tmp/proj/sub/file.bpmn")).toBe("/tmp/proj/sub");
    });

    it("getDocumentDirectory preserves the file:// scheme of the input", () => {
        const ws = new NodeWorkspace();
        expect(ws.getDocumentDirectory("file:///tmp/proj/sub/file.bpmn")).toBe(
            "file:///tmp/proj/sub",
        );
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

/**
 * The element-templates glob the adapter compiles to match changed paths
 * against — extension-less so a one-shot folder copy (which can surface only as
 * a directory-create event) still triggers a refresh. Kept in sync with
 * `ArtifactService.createWatcher`.
 */
const PATTERN = "**/.camunda/element-templates/**";

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
        root = await fs.mkdtemp(join(tmpdir(), "modeler-watch-"));
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

    it("ignores json files outside element-templates", async () => {
        const onCreate = vi.fn();
        const onChange = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onCreate, onChange });
        await sleep(SETTLE_MS);

        // JSON under the config folder but not in element-templates → ignored.
        await fs.mkdir(join(root, ".camunda"), { recursive: true });
        await fs.writeFile(join(root, ".camunda", "config.json"), "{}", "utf8");

        await sleep(SETTLE_MS);
        expect(onCreate).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
    }, 15000);

    it("fires for any file inside element-templates, not only json", async () => {
        // The extension-less glob deliberately over-fires: a one-shot folder
        // copy can surface as a bare directory event, so the watcher must catch
        // more than `*.json`. The refresh re-scans from disk and filters `.json`
        // itself, so a non-json event is a harmless redundant re-push.
        const onCreate = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onCreate });
        await sleep(SETTLE_MS);

        await fs.mkdir(templatesDir, { recursive: true });
        await fs.writeFile(join(templatesDir, "notes.txt"), "hi", "utf8");

        await waitForCall(onCreate);
        expect(onCreate).toHaveBeenCalled();
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

    // The source glob (extensions `{java,kt,…}`) is the code-link watcher's
    // pattern. An earlier version hardcoded the template matcher and ignored the
    // glob, so a saved `.java` file never reached the handler — these pin the fix.
    const SOURCE_GLOB = "**/*.{java,kt,groovy,scala,js,ts}";

    it("honours the source glob: fires onCreate for a created .java file", async () => {
        const onCreate = vi.fn();
        handle = workspace.createWatcher(root, SOURCE_GLOB, { onCreate });
        await sleep(SETTLE_MS);

        await fs.mkdir(join(root, "src", "main", "java"), { recursive: true });
        await fs.writeFile(
            join(root, "src", "main", "java", "Worker.java"),
            "class Worker {}",
            "utf8",
        );

        await waitForCall(onCreate);
        expect(onCreate).toHaveBeenCalled();
    }, 15000);

    it("honours the source glob: ignores a non-matching .json file", async () => {
        const onCreate = vi.fn();
        handle = workspace.createWatcher(root, SOURCE_GLOB, { onCreate });
        await sleep(SETTLE_MS);

        await fs.writeFile(join(root, "config.json"), "{}", "utf8");

        await sleep(SETTLE_MS);
        expect(onCreate).not.toHaveBeenCalled();
    }, 15000);

    it("still fires for a template under the template glob", async () => {
        const onCreate = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onCreate });
        await sleep(SETTLE_MS);

        await fs.mkdir(templatesDir, { recursive: true });
        await fs.writeFile(join(templatesDir, "task.json"), "[]", "utf8");

        await waitForCall(onCreate);
        expect(onCreate).toHaveBeenCalled();
    }, 15000);
});

/**
 * `writeFile` backs the code-link artifact persistence. It must mkdirp the
 * nested `<config>/code-link/…` target — the directory rarely exists yet — which
 * the prior stub (a hard throw) never did.
 */
describe("NodeWorkspace.writeFile", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-write-"));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("creates missing parent directories", async () => {
        const target = join(root, ".camunda", "code-link", "sub", "order.bpmn.json");
        await new NodeWorkspace().writeFile(target, '{"ok":true}');
        expect(await fs.readFile(target, "utf8")).toBe('{"ok":true}');
    });

    it("overwrites an existing file", async () => {
        const target = join(root, "out.json");
        const ws = new NodeWorkspace();
        await ws.writeFile(target, "first");
        await ws.writeFile(target, "second");
        expect(await fs.readFile(target, "utf8")).toBe("second");
    });
});
