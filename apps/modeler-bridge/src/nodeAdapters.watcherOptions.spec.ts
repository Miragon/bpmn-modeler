import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeWorkspace } from "./nodeAdapters";

/**
 * Mocks chokidar to capture the options object `createWatcher` hands to
 * `watch(root, opts)`. The real-chokidar suite in `nodeAdapters.spec.ts`
 * cannot assert this: `usePolling` is `false` on the macOS/Linux CI it runs on,
 * so the Windows lock fix would be unverified everywhere it actually
 * matters. Mocking makes the assertion deterministic on every OS — it pins that
 * the Windows branch sets stat-based polling instead of `fs.watch`.
 */
const { watchSpy, closeSpy, chokidarListeners, readdirSpy, fsEvents, statSpy } = vi.hoisted(() => {
    const closeSpy = vi.fn(() => Promise.resolve());
    const chokidarListeners = new Map<string, (path: string) => void>();
    const fsEvents: { listener?: (event: string, filename: string | null) => void } = {};
    return {
        closeSpy,
        chokidarListeners,
        fsEvents,
        readdirSpy: vi.fn(),
        statSpy: vi.fn(),
        watchSpy: vi.fn((_root: string, _opts: Record<string, unknown>) => ({
            on(event: string, listener: (path: string) => void) {
                chokidarListeners.set(event, listener);
                return this;
            },
            close: closeSpy,
        })),
    };
});

vi.mock("chokidar", () => ({ watch: watchSpy }));

// A UNC root cannot be read on the macOS/Linux CI, so `fs.readdir` is stubbed;
// the macOS recursive watch is stubbed so its events play on every OS.
vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return {
        ...actual,
        promises: { ...actual.promises, readdir: readdirSpy, stat: statSpy },
        watch: (_root: string, _options: unknown, listener: typeof fsEvents.listener) => {
            fsEvents.listener = listener;
            return { close: closeSpy };
        },
    };
});

describe("NodeWorkspace.createWatcher chokidar options", () => {
    afterEach(() => {
        watchSpy.mockClear();
        closeSpy.mockClear();
        vi.unstubAllGlobals();
    });

    /** Reads the options object passed to the single `watch()` call. */
    function capturedOptions(): Record<string, unknown> {
        new NodeWorkspace().createWatcher("/repo", "**/*.json", {});
        expect(watchSpy).toHaveBeenCalledTimes(1);
        return watchSpy.mock.calls[0][1];
    }

    it("enables stat polling on Windows so no directory handle locks element-templates", () => {
        vi.stubGlobal("process", { ...process, platform: "win32" });

        const opts = capturedOptions();

        expect(opts.usePolling).toBe(true);
        expect(opts.interval).toBe(300);
        expect(opts.binaryInterval).toBe(300);
    });

    it("keeps native fs.watch on non-Windows platforms", () => {
        vi.stubGlobal("process", { ...process, platform: "linux" });

        expect(capturedOptions().usePolling).toBe(false);
    });

    it("prunes generated trees below the root but not the root's own ancestors", () => {
        vi.stubGlobal("process", { ...process, platform: "linux" });
        new NodeWorkspace().createWatcher("/work/build/repo", "**/*.json", {});
        const ignored = watchSpy.mock.calls[0][1].ignored as (path: string) => boolean;

        expect(ignored("/work/build/repo/.camunda/element-templates/a.json")).toBe(false);
        expect(ignored("/work/build/repo/service/bin/test/process.bpmn")).toBe(true);
        expect(ignored("/work/build/repo/service/build/classes")).toBe(true);
        expect(ignored("/work/build/repo/web/node_modules/x/index.js")).toBe(true);
        expect(ignored("/work/build/repo/.gradle/caches")).toBe(true);
    });
});

describe("NodeWorkspace.createWatcher sharing", () => {
    beforeEach(() => {
        vi.stubGlobal("process", { ...process, platform: "linux" });
    });

    afterEach(() => {
        watchSpy.mockClear();
        closeSpy.mockClear();
        vi.unstubAllGlobals();
    });

    it("arms one chokidar watcher per root regardless of subscriber count", () => {
        const workspace = new NodeWorkspace();

        workspace.createWatcher("/repo", "**/*.form", {});
        workspace.createWatcher("/repo", "**/*.java", {});
        workspace.createWatcher("/other", "**/*.java", {});

        expect(watchSpy.mock.calls.map(([root]) => root)).toEqual(["/repo", "/other"]);
    });

    it("closes the shared watcher only when its last subscriber disposes", () => {
        const workspace = new NodeWorkspace();
        const first = workspace.createWatcher("/repo", "**/*.form", {});
        const second = workspace.createWatcher("/repo", "**/*.java", {});

        first.dispose();
        expect(closeSpy).not.toHaveBeenCalled();

        second.dispose();
        expect(closeSpy).toHaveBeenCalledTimes(1);

        workspace.createWatcher("/repo", "**/*.form", {});
        expect(watchSpy).toHaveBeenCalledTimes(2);
    });
});

describe("NodeWorkspace path spelling", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        watchSpy.mockClear();
        readdirSpy.mockReset();
        chokidarListeners.clear();
        vi.unstubAllGlobals();
    });

    /** Emits each chokidar event for `emittedPath` and records what every handler receives. */
    function pathsHandedToTheCore(root: string, emittedPath: string) {
        const received = {
            deleted: [] as string[],
            changed: [] as string[],
            created: [] as string[],
        };
        new NodeWorkspace().createWatcher(root, "**/*.java", {
            onDelete: (path) => received.deleted.push(path),
            onChange: (path) => received.changed.push(path),
            onCreate: (path) => received.created.push(path),
        });
        for (const event of ["unlink", "change", "add"]) {
            chokidarListeners.get(event)?.(emittedPath);
            vi.advanceTimersByTime(50);
        }
        return received;
    }

    /** Lists what `findFiles` finds below `root` in a tree holding only `<folder>/<file>`. */
    async function pathsFound(root: string, folder: string, file: string): Promise<string[]> {
        const entry = (name: string, isFolder: boolean) => ({
            name,
            isDirectory: () => isFolder,
        });
        readdirSpy.mockImplementation(async (path: string) =>
            path.endsWith(`/${folder}`) ? [entry(file, false)] : [entry(folder, true)],
        );
        const workspace = new NodeWorkspace();
        workspace.registerRoot(root);
        return workspace.findFiles("**/*.java");
    }

    it.each([
        {
            rootForm: "a POSIX root",
            platform: "linux",
            root: "/repo",
            emittedPath: "/repo/src/A.java",
            spelled: "/repo/src/A.java",
        },
        {
            rootForm: "a drive-letter root",
            platform: "win32",
            root: "C:/repo",
            emittedPath: "C:\\repo\\src\\A.java",
            spelled: "C:/repo/src/A.java",
        },
        {
            rootForm: "a UNC root with forward slashes",
            platform: "win32",
            root: "//server/share/repo",
            emittedPath: "\\\\server\\share\\repo\\src\\A.java",
            spelled: "//server/share/repo/src/A.java",
        },
        {
            rootForm: "a UNC root with backslashes",
            platform: "win32",
            root: "\\\\server\\share\\repo",
            emittedPath: "\\\\server\\share\\repo\\src\\A.java",
            spelled: "//server/share/repo/src/A.java",
        },
        {
            rootForm: "a UNC root with mixed separators",
            platform: "win32",
            root: "\\\\server/share\\repo",
            emittedPath: "//server/share\\repo\\src/A.java",
            spelled: "//server/share/repo/src/A.java",
        },
    ])(
        "spells a file under $rootForm the same in findFiles and the watcher",
        async ({ platform, root, emittedPath, spelled }) => {
            vi.stubGlobal("process", { ...process, platform });

            const watched = pathsHandedToTheCore(root, emittedPath);
            const found = await pathsFound(root, "src", "A.java");

            expect(found).toEqual([spelled]);
            expect(watched).toEqual({ deleted: [spelled], changed: [spelled], created: [spelled] });
        },
    );
});

describe("NodeWorkspace.createWatcher debounce", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("process", { ...process, platform: "linux" });
    });

    afterEach(() => {
        vi.useRealTimers();
        watchSpy.mockClear();
        chokidarListeners.clear();
        vi.unstubAllGlobals();
    });

    // The macOS watcher reports every new file as an add followed by a change.
    it("reports a file added and changed within the debounce as created", () => {
        const received: string[] = [];
        new NodeWorkspace().createWatcher("/repo", "**/*.java", {
            onCreate: (path) => received.push(`create ${path}`),
            onChange: (path) => received.push(`change ${path}`),
            onDelete: (path) => received.push(`delete ${path}`),
        });

        chokidarListeners.get("add")?.("/repo/src/A.java");
        chokidarListeners.get("change")?.("/repo/src/A.java");
        vi.advanceTimersByTime(50);

        expect(received).toEqual(["create /repo/src/A.java"]);
    });
});

describe("NodeWorkspace.createWatcher on macOS", () => {
    const WATCH_STARTED_MS = 1_000;
    const BORN_BEFORE_WATCH = { birthtimeMs: 500 };
    const BORN_DURING_WATCH = { birthtimeMs: 2_000 };

    beforeEach(() => {
        vi.useFakeTimers({ now: WATCH_STARTED_MS });
        vi.stubGlobal("process", { ...process, platform: "darwin" });
    });

    afterEach(() => {
        vi.useRealTimers();
        statSpy.mockReset();
        fsEvents.listener = undefined;
        vi.unstubAllGlobals();
    });

    function watchSources() {
        const received: string[] = [];
        new NodeWorkspace().createWatcher("/repo", "**/*.java", {
            onCreate: (path) => received.push(`create ${path}`),
            onChange: (path) => received.push(`change ${path}`),
            onDelete: (path) => received.push(`delete ${path}`),
        });
        // FSEvents names every create, rewrite and delete a `rename`.
        const rename = async (filename: string, stat: { birthtimeMs: number } | "missing") => {
            statSpy.mockImplementationOnce(async () => {
                if (stat === "missing")
                    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
                return stat;
            });
            fsEvents.listener?.("rename", filename);
            await vi.advanceTimersByTimeAsync(50);
        };
        return { received, rename };
    }

    it("reports a file born during the watch as created and its rewrites as changed", async () => {
        const { received, rename } = watchSources();

        await rename("src/A.java", BORN_DURING_WATCH);
        await rename("src/A.java", BORN_DURING_WATCH);

        expect(received).toEqual(["create /repo/src/A.java", "change /repo/src/A.java"]);
    });

    // A move keeps the birth time, and so does a copy that keeps the timestamps.
    it("reports a file moved in with a birth time older than the watch as created", async () => {
        const { received, rename } = watchSources();

        await rename("src/Moved.java", BORN_BEFORE_WATCH);

        expect(received).toEqual(["create /repo/src/Moved.java"]);
    });

    it("reports an atomic save of a seen file as changed and a recreated file as created", async () => {
        const { received, rename } = watchSources();

        await rename("src/A.java", BORN_BEFORE_WATCH);
        await rename("src/A.java", BORN_DURING_WATCH);
        await rename("src/A.java", "missing");
        await rename("src/A.java", BORN_DURING_WATCH);

        expect(received).toEqual([
            "create /repo/src/A.java",
            "change /repo/src/A.java",
            "delete /repo/src/A.java",
            "create /repo/src/A.java",
        ]);
    });

    it("forgets a deleted file but not the files beside it", async () => {
        const { received, rename } = watchSources();

        await rename("src/A.java", BORN_DURING_WATCH);
        await rename("src/B.java", BORN_DURING_WATCH);
        await rename("src/A.java", "missing");
        await rename("src/B.java", BORN_DURING_WATCH);
        await rename("src/A.java", BORN_DURING_WATCH);

        expect(received).toEqual([
            "create /repo/src/A.java",
            "create /repo/src/B.java",
            "delete /repo/src/A.java",
            "change /repo/src/B.java",
            "create /repo/src/A.java",
        ]);
    });

    it("forgets the files of a deleted folder", async () => {
        const { received, rename } = watchSources();

        await rename("src/A.java", BORN_DURING_WATCH);
        await rename("src", "missing");
        await rename("src/A.java", BORN_DURING_WATCH);

        expect(received).toEqual(["create /repo/src/A.java", "create /repo/src/A.java"]);
    });
});
