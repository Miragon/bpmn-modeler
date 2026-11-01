import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    onTestFinished,
    vi,
} from "vitest";

import {
    AdHocDestination,
    ArtifactService,
    DeploymentDestination,
    DeploymentTarget,
    DeploymentTargetService,
    EnvValueResolver,
    envRefsIn,
    expandEnvRefs,
    NO_ENV_VARIABLES,
    NamedDestination,
    NoWorkspaceFolderFoundError,
    requestDestination,
    serializeDeploymentTargets,
    SettingChange,
    TargetsLocation,
    UnreadableDotEnvError,
} from "@miragon/bpmn-modeler-core";

import { BridgeSettings, NodeWorkspace } from "./nodeAdapters";

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

describe("NodeWorkspace.findFiles below excluded folders", () => {
    let root: string;
    let outside: string;

    beforeAll(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-find-prune-"));
        outside = await fs.mkdtemp(join(tmpdir(), "modeler-find-prune-outside-"));
        for (const dir of ["src", "node_modules/pkg", "dist", "target/classes"]) {
            await fs.mkdir(join(root, dir), { recursive: true });
            await fs.writeFile(join(root, dir, "p.bpmn"), "<definitions/>");
        }
        await fs.writeFile(join(outside, "linked.bpmn"), "<definitions/>");
        await fs.symlink(outside, join(root, "src/linked"), "dir");
    });

    afterAll(async () => {
        await fs.rm(root, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
    });

    function workspace(): NodeWorkspace {
        const ws = new NodeWorkspace();
        ws.registerRoot(root);
        return ws;
    }

    it("reads no folder its exclude covers", async () => {
        const readdir = vi.spyOn(fs, "readdir");
        onTestFinished(() => readdir.mockRestore());

        const found = await workspace().findFiles("**/*.bpmn", "**/{node_modules,dist,target}/**");

        expect(found).toEqual([join(root, "src/p.bpmn")]);
        const readFolders = readdir.mock.calls.map(([path]) => String(path));
        expect(readFolders).toContain(join(root, "src"));
        expect(readFolders.filter((path) => /node_modules|dist|target/.test(path))).toEqual([]);
    });

    it("does not follow a symlinked folder", async () => {
        const found = await workspace().findFiles("**/linked.bpmn");

        expect(found).toEqual([]);
    });
});

describe("NodeWorkspace.findFiles beside a folder it cannot read", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-find-unreadable-"));
        for (const dir of ["src", "pgdata", "node_modules/x", "locked"]) {
            await fs.mkdir(join(root, dir), { recursive: true });
        }
        await fs.writeFile(join(root, "src/p.bpmn"), "<definitions/>");
    });

    afterEach(async () => {
        await fs.chmod(join(root, "pgdata"), 0o755);
        await fs.chmod(join(root, "node_modules/x"), 0o755);
        await fs.rm(root, { recursive: true, force: true });
    });

    function workspace(...roots: string[]): NodeWorkspace {
        const ws = new NodeWorkspace();
        roots.forEach((path) => ws.registerRoot(path));
        return ws;
    }

    it("lists the rest of the workspace when a folder denies reading it", async () => {
        await fs.chmod(join(root, "pgdata"), 0o000);
        await fs.chmod(join(root, "node_modules/x"), 0o000);

        await expect(workspace(root).findFiles("**/*.bpmn")).resolves.toEqual([
            join(root, "src/p.bpmn"),
        ]);
    });

    it("lists the rest of the workspace when the system forbids reading a folder", async () => {
        const locked = join(root, "locked");
        const forbidden = Object.assign(new Error(`EPERM: operation not permitted`), {
            code: "EPERM",
        });
        const readdir = fs.readdir.bind(fs);
        const readdirForbiddingLocked = ((path: string, options: never) =>
            path === locked
                ? Promise.reject(forbidden)
                : readdir(path, options)) as typeof fs.readdir;
        const spy = vi.spyOn(fs, "readdir").mockImplementation(readdirForbiddingLocked);
        onTestFinished(() => spy.mockRestore());

        await expect(workspace(root).findFiles("**/*.bpmn")).resolves.toEqual([
            join(root, "src/p.bpmn"),
        ]);
    });

    it("lists the other roots when one root is gone", async () => {
        const gone = join(root, "gone");

        await expect(workspace(gone, root).findFiles("**/*.bpmn")).resolves.toEqual([
            join(root, "src/p.bpmn"),
        ]);
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

    it.each([
        ["outer first", ["/ws", "/ws/nested"]],
        ["inner first", ["/ws/nested", "/ws"]],
    ])("resolves the innermost of nested roots (%s)", (_order, roots) => {
        const ws = new NodeWorkspace();
        roots.forEach((nestedRoot) => ws.registerRoot(nestedRoot));

        expect(ws.findWorkspaceFolderForDocument("/ws/nested/sub/file.bpmn")).toBe("/ws/nested");
        expect(ws.getWorkspaceFolderForDocument("file:///ws/nested/file.bpmn")).toBe(
            "file:///ws/nested",
        );
        expect(ws.findWorkspaceFolderForDocument("/ws/other/file.bpmn")).toBe("/ws");
    });

    it("does not treat a sibling sharing a name prefix as nested", () => {
        const ws = new NodeWorkspace();
        ws.registerRoot("/ws");
        ws.registerRoot("/ws/nested");

        expect(ws.findWorkspaceFolderForDocument("/ws/nested-other/file.bpmn")).toBe("/ws");
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

    it("fires onCreate for a template moved in from outside the root", async () => {
        await fs.mkdir(templatesDir, { recursive: true });
        const outside = await fs.mkdtemp(join(tmpdir(), "modeler-watch-outside-"));
        onTestFinished(() => fs.rm(outside, { recursive: true, force: true }));
        const movedFrom = join(outside, "task.json");
        await fs.writeFile(movedFrom, "[]", "utf8");
        const onCreate = vi.fn();
        const onChange = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onCreate, onChange });
        await sleep(SETTLE_MS);

        await fs.rename(movedFrom, join(templatesDir, "task.json"));

        await waitForCall(onCreate);
        expect(onChange).not.toHaveBeenCalled();
    }, 15000);

    // The bridge on macOS cannot tell the first rewrite of a file from its create.
    it("fires onChange or onCreate when an existing template is modified", async () => {
        await fs.mkdir(templatesDir, { recursive: true });
        const file = join(templatesDir, "task.json");
        await fs.writeFile(file, "[]", "utf8");

        const onChangeOrCreate = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, {
            onChange: onChangeOrCreate,
            onCreate: onChangeOrCreate,
        });
        await sleep(SETTLE_MS);

        await fs.writeFile(file, '[{"name":"a"}]', "utf8");

        await waitForCall(onChangeOrCreate);
        expect(onChangeOrCreate).toHaveBeenCalled();
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

    it("routes each event only to the subscribers whose glob matches", async () => {
        const onTemplate = vi.fn();
        const onForm = vi.fn();
        handle = workspace.createWatcher(root, PATTERN, { onCreate: onTemplate });
        const formHandle = workspace.createWatcher(root, "**/*.form", { onCreate: onForm });
        await sleep(SETTLE_MS);

        await fs.writeFile(join(root, "order.form"), "{}", "utf8");

        await waitForCall(onForm);
        expect(onTemplate).not.toHaveBeenCalled();
        formHandle.dispose();
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

describe("NodeWorkspace.isSymbolicLink", () => {
    let root: string;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-symlink-"));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("is false for a regular file", async () => {
        const file = join(root, ".env");
        await fs.writeFile(file, "MIRAGON_TOKEN=secret");

        expect(await new NodeWorkspace().isSymbolicLink(file)).toBe(false);
    });

    it("is true for a symbolic link to a file", async () => {
        const target = join(root, "elsewhere.env");
        await fs.writeFile(target, "MIRAGON_TOKEN=secret");
        const link = join(root, ".env");
        await fs.symlink(target, link);

        expect(await new NodeWorkspace().isSymbolicLink(link)).toBe(true);
    });

    it("is true for a dangling symbolic link", async () => {
        const link = join(root, ".env");
        await fs.symlink(join(root, "deleted.env"), link);

        expect(await new NodeWorkspace().isSymbolicLink(link)).toBe(true);
    });

    it("is false for a missing path", async () => {
        expect(await new NodeWorkspace().isSymbolicLink(join(root, ".env"))).toBe(false);
    });
});

const DEV_TARGET = DeploymentTarget.create({
    name: "dev",
    engine: "c7",
    endpoint: "https://engine.example/rest",
    authType: "none",
});

/**
 * A workspace-root `.env` directory (e.g. a Python virtualenv) once failed
 * every deploy with EISDIR, even for targets that reference no variables.
 */
describe("EnvValueResolver over a real NodeWorkspace", () => {
    const REFERENCES_ENV = envRefsIn("${env:MIRAGON_TOKEN}");
    const AD_HOC = new AdHocDestination("https://engine.example/rest", "");
    const DESTINATIONS: [string, () => DeploymentDestination][] = [
        ["a named target", () => named],
        ["an ad-hoc request", () => AD_HOC],
    ];

    let root: string;
    let workspace: NodeWorkspace;
    let named: NamedDestination;
    let resolver: EnvValueResolver;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-dotenv-"));
        workspace = new NodeWorkspace();
        workspace.registerRoot(root);
        const location: TargetsLocation = {
            filePath: join(root, ".camunda", "deployment-targets.json"),
            exists: true,
            projectDir: root,
        };
        named = new NamedDestination(DEV_TARGET, location);
        resolver = new EnvValueResolver(workspace);
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it.each(DESTINATIONS)(
        "ignores a .env directory when nothing references env for %s",
        async (_kind, destination) => {
            await fs.mkdir(join(root, ".env"));
            const readFile = vi.spyOn(workspace, "readFile");

            const lookup = await resolver.createLookup(
                destination(),
                join(root, "processes"),
                envRefsIn("https://engine.example/rest"),
            );

            expect(lookup).toBe(NO_ENV_VARIABLES);
            expect(readFile).not.toHaveBeenCalled();
        },
    );

    it.each(DESTINATIONS)(
        "rejects a .env directory with UnreadableDotEnvError when a reference needs it for %s",
        async (_kind, destination) => {
            await fs.mkdir(join(root, ".env"));

            const result = resolver.createLookup(
                destination(),
                join(root, "processes"),
                REFERENCES_ENV,
            );

            await expect(result).rejects.toBeInstanceOf(UnreadableDotEnvError);
            await expect(result).rejects.toMatchObject({
                path: join(root, ".env"),
                message: expect.stringContaining("EISDIR"),
            });
        },
    );

    it.each(DESTINATIONS)(
        "refuses a symlinked .env without reading its target for %s",
        async (_kind, destination) => {
            const foreignSecrets = join(root, "other-project.env");
            await fs.writeFile(foreignSecrets, "MIRAGON_TOKEN=foreign");
            await fs.symlink(foreignSecrets, join(root, ".env"));
            const readFile = vi.spyOn(workspace, "readFile");

            const result = resolver.createLookup(
                destination(),
                join(root, "processes"),
                REFERENCES_ENV,
            );

            await expect(result).rejects.toBeInstanceOf(UnreadableDotEnvError);
            await expect(result).rejects.toMatchObject({
                path: join(root, ".env"),
                message: expect.stringContaining("symbolic links are not followed"),
            });
            expect(readFile).not.toHaveBeenCalled();
        },
    );

    it("resolves only MIRAGON_-prefixed variables from a regular .env", async () => {
        await fs.writeFile(
            join(root, ".env"),
            "MIRAGON_TOKEN=secret\nAWS_SECRET_ACCESS_KEY=foreign\n",
        );

        const lookup = await resolver.createLookup(named, join(root, "processes"), REFERENCES_ENV);

        expect(lookup("MIRAGON_TOKEN")).toBe("secret");
        expect(lookup("AWS_SECRET_ACCESS_KEY")).toBeUndefined();
        expect(lookup.source).toBe(join(root, ".env"));
    });

    it.each(DESTINATIONS)(
        "reads the .env for a diagram directly in the workspace root for %s",
        async (_kind, destination) => {
            await fs.writeFile(join(root, ".env"), "MIRAGON_TOKEN=secret");

            const lookup = await resolver.createLookup(destination(), root, REFERENCES_ENV);

            expect(lookup("MIRAGON_TOKEN")).toBe("secret");
        },
    );

    it("returns a lookup naming the .env path when the file is missing", async () => {
        const lookup = await resolver.createLookup(named, join(root, "processes"), REFERENCES_ENV);

        expect(lookup("MIRAGON_TOKEN")).toBeUndefined();
        expect(lookup.source).toBe(join(root, ".env"));
    });

    it("reads an ad-hoc reference from the innermost registered root's .env", async () => {
        const nestedRoot = join(root, "nested");
        await fs.mkdir(nestedRoot);
        await fs.writeFile(join(root, ".env"), "MIRAGON_TOKEN=outer");
        await fs.writeFile(join(nestedRoot, ".env"), "MIRAGON_TOKEN=inner");
        workspace.registerRoot(nestedRoot);

        const lookup = await resolver.createLookup(
            AD_HOC,
            join(nestedRoot, "processes"),
            REFERENCES_ENV,
        );

        expect(lookup("MIRAGON_TOKEN")).toBe("inner");
        expect(lookup.source).toBe(join(nestedRoot, ".env"));
    });

    it.each(DESTINATIONS)(
        "reads no .env for a document outside every registered root for %s",
        async (_kind, destination) => {
            await fs.writeFile(join(root, ".env"), "MIRAGON_TOKEN=secret");
            const readFile = vi.spyOn(workspace, "readFile");

            const lookup = await resolver.createLookup(
                destination(),
                join(tmpdir(), "outside-every-root"),
                REFERENCES_ENV,
            );

            expect(lookup).toBe(NO_ENV_VARIABLES);
            expect(readFile).not.toHaveBeenCalled();
        },
    );
});

/**
 * A vendored project's own targets file sits nearer to its diagrams than the
 * workspace root's; its `.env` must not supply variables for an endpoint the
 * user typed ad hoc.
 */
describe("EnvValueResolver beside a nested targets file", () => {
    const ENDPOINT_TEMPLATE = "https://${env:MIRAGON_HOST}/engine-rest";
    const AD_HOC = new AdHocDestination(ENDPOINT_TEMPLATE, "");

    let root: string;
    let nestedProject: string;
    let targetsLocator: DeploymentTargetService;
    let resolver: EnvValueResolver;

    beforeEach(async () => {
        root = await fs.mkdtemp(join(tmpdir(), "modeler-dotenv-scope-"));
        nestedProject = join(root, "vendor", "lib");
        await fs.mkdir(join(nestedProject, ".camunda"), { recursive: true });
        await fs.writeFile(join(root, ".env"), "MIRAGON_HOST=engine.corp\n");
        await fs.writeFile(join(nestedProject, ".env"), "MIRAGON_HOST=attacker\n");
        await fs.writeFile(
            join(nestedProject, ".camunda", "deployment-targets.json"),
            serializeDeploymentTargets([DEV_TARGET]),
        );
        const workspace = new NodeWorkspace();
        workspace.registerRoot(root);
        const settings = new BridgeSettings();
        targetsLocator = new DeploymentTargetService(
            new ArtifactService(workspace, settings),
            settings,
            workspace,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );
        resolver = new EnvValueResolver(workspace);
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it("resolves an ad-hoc reference from the workspace folder's .env", async () => {
        await expect(targetsLocator.locateTargetsFile(nestedProject)).resolves.toMatchObject({
            projectDir: nestedProject,
            exists: true,
        });

        const lookup = await resolver.createLookup(
            AD_HOC,
            nestedProject,
            envRefsIn(ENDPOINT_TEMPLATE),
        );

        expect(expandEnvRefs(ENDPOINT_TEMPLATE, lookup, "endpoint")).toBe(
            "https://engine.corp/engine-rest",
        );
        expect(lookup.source).toBe(join(root, ".env"));
    });

    it("resolves a named target's reference from the nested project's .env", async () => {
        const destination = requestDestination(
            await targetsLocator.resolveDestination("dev", AD_HOC, nestedProject),
        );
        const lookup = await resolver.createLookup(
            destination,
            nestedProject,
            envRefsIn(ENDPOINT_TEMPLATE),
        );

        expect(expandEnvRefs(ENDPOINT_TEMPLATE, lookup, "endpoint")).toBe(
            "https://attacker/engine-rest",
        );
        expect(lookup.source).toBe(join(nestedProject, ".env"));
    });
});

describe("BridgeSettings", () => {
    it("reports a scripting.spin change under the key VS Code names", () => {
        const settings = new BridgeSettings();
        const changes: SettingChange[] = [];
        settings.onDidChange((change) => changes.push(change));

        settings.apply({ scriptingSpin: false });

        expect(changes.map((change) => change.affects("scripting.spin"))).toEqual([true]);
    });
});
