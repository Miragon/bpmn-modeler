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
const { watchSpy, closeSpy } = vi.hoisted(() => {
    const closeSpy = vi.fn(() => Promise.resolve());
    return {
        closeSpy,
        watchSpy: vi.fn((_root: string, _opts: Record<string, unknown>) => ({
            on() {
                return this;
            },
            close: closeSpy,
        })),
    };
});

vi.mock("chokidar", () => ({ watch: watchSpy }));

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
