import { beforeEach, describe, expect, it, vi } from "vitest";

import { DirectoryNotFound } from "../../shared/domain/errors";
import { WorkspacePort } from "../../shared/domain/hostPorts";
import { LocalFileSource } from "./LocalFileSource";

/**
 * In-memory {@link WorkspacePort} over a flat map of absolute path → content, so
 * the adapter's recursion and path round-tripping are exercised without touching
 * a real filesystem. A directory with no entries reads as {@link DirectoryNotFound}.
 */
function fakeWorkspace(files: Record<string, string>): WorkspacePort {
    const readFile = vi.fn(async (path: string) => {
        const content = files[path];
        if (content === undefined) {
            throw new Error(`ENOENT: ${path}`);
        }
        return content;
    });

    const readDirectory = vi.fn(async (dir: string) => {
        const root = dir.replace(/\/+$/, "");
        const children = new Map<string, "file" | "directory">();
        for (const path of Object.keys(files)) {
            if (!path.startsWith(`${root}/`)) {
                continue;
            }
            const rest = path.slice(root.length + 1);
            const slash = rest.indexOf("/");
            children.set(
                slash === -1 ? rest : rest.slice(0, slash),
                slash === -1 ? "file" : "directory",
            );
        }
        if (children.size === 0) {
            throw new DirectoryNotFound(dir);
        }
        return [...children.entries()];
    });

    return { readFile, readDirectory } as unknown as WorkspacePort;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("LocalFileSource.listTemplateFiles", () => {
    it("lists .json files recursively under the source path as root-relative paths", async () => {
        const workspace = fakeWorkspace({
            "/root/templates/a.json": "{}",
            "/root/templates/nested/b.json": "{}",
            "/root/templates/readme.md": "ignore me",
            "/root/other/c.json": "{}",
        });
        const source = new LocalFileSource(workspace, {
            kind: "local",
            rootDir: "/root",
            path: "templates",
        });

        expect((await source.listTemplateFiles()).sort()).toEqual([
            "templates/a.json",
            "templates/nested/b.json",
        ]);
    });

    it("scans the whole root when the source path is empty", async () => {
        const workspace = fakeWorkspace({ "/root/a.json": "{}", "/root/sub/b.json": "{}" });
        const source = new LocalFileSource(workspace, {
            kind: "local",
            rootDir: "/root",
            path: "",
        });

        expect((await source.listTemplateFiles()).sort()).toEqual(["a.json", "sub/b.json"]);
    });

    it("returns [] for a missing subtree instead of throwing", async () => {
        const workspace = fakeWorkspace({ "/root/a.json": "{}" });
        const source = new LocalFileSource(workspace, {
            kind: "local",
            rootDir: "/root",
            path: "does-not-exist",
        });

        expect(await source.listTemplateFiles()).toEqual([]);
    });
});

describe("LocalFileSource.fetchFile", () => {
    it("reads a root-relative path against rootDir", async () => {
        const workspace = fakeWorkspace({ "/root/templates/a.json": '{"x":1}' });
        const source = new LocalFileSource(workspace, {
            kind: "local",
            rootDir: "/root/",
            path: "templates",
        });

        // A trailing slash on rootDir must not double up in the joined path.
        expect(await source.fetchFile("templates/a.json")).toBe('{"x":1}');
        expect(workspace.readFile).toHaveBeenCalledWith("/root/templates/a.json");
    });

    it("reads marketplace.json at the root (empty source path)", async () => {
        const workspace = fakeWorkspace({ "/root/marketplace.json": '{"sources":[]}' });
        const source = new LocalFileSource(workspace, {
            kind: "local",
            rootDir: "/root",
            path: "",
        });

        expect(await source.fetchFile("marketplace.json")).toBe('{"sources":[]}');
    });
});
