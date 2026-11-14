import { beforeEach, describe, expect, it, vi } from "vitest";

// `window.tabGroups.all` is the only vscode value `shouldResolveAsDiff` reads;
// a mutable `tabs` array lets each test stage the label heuristic. `vi.hoisted`
// keeps it usable inside the (hoisted) `vi.mock` factory.
const { tabs, parsedUri } = vi.hoisted(() => ({
    tabs: [] as { input: unknown; label: string }[],
    /** A vscode `Uri` stand-in for an unencoded URI string, with the three fields the controller reads. */
    parsedUri: (value: string) => ({
        scheme: value.split(":")[0],
        path: value.replace(/^[a-z]+:(\/\/[^/]*)?/, "").split(/[?#]/)[0],
        toString: () => value,
    }),
}));
vi.mock("vscode", () => ({
    window: { tabGroups: { all: [{ tabs }] } },
    workspace: { onDidChangeConfiguration: vi.fn() },
    commands: { executeCommand: vi.fn() },
    Uri: { parse: parsedUri },
}));

import { commands, workspace } from "vscode";

import {
    compareTabLabel,
    createDiffPaneRouter,
    DiffPaneStore,
    DiffFileExtension,
} from "@miragon/bpmn-modeler-core";
import { FakeDiffPaneHandle, RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";
import { vsCodeModelerPreferences } from "../../../shared/adapter/out/modelerConfiguration";
import { BootstrappableDiffPane, DiffController } from "./DiffController";

const bootstrapSpy = vi.fn();

/** Mirrors the real pane's shape, `uri` derived from the document, so the store's lookups match. */
function fakePane(
    _panel: unknown,
    document: { uri: { toString(): string } },
): BootstrappableDiffPane {
    return Object.assign(new FakeDiffPaneHandle(document.uri.toString()), {
        bootstrap: bootstrapSpy,
    });
}

function uri(scheme: string, value: string) {
    return { ...parsedUri(value), scheme } as never;
}

/** A `TextDocument` stand-in: only its `uri` (path + stringification) is read. */
function fakeDoc(scheme: string, path: string, value: string) {
    return { uri: { scheme, path, toString: () => value } } as never;
}

/**
 * A `WebviewPanel` stand-in that captures the message and dispose callbacks the
 * controller registers, so tests can drive `onMessage` / `disposePane` directly.
 */
function fakePanel() {
    const cbs: { message?: (m: unknown) => unknown; dispose?: () => void } = {};
    const panel = {
        webview: {
            onDidReceiveMessage: vi.fn((cb: (m: unknown) => unknown) => {
                cbs.message = cb;
            }),
        },
        onDidDispose: vi.fn((cb: () => void) => {
            cbs.dispose = cb;
        }),
    };
    return { panel: panel as never, cbs };
}

function createController(extension: DiffFileExtension = ".bpmn") {
    const store = new DiffPaneStore();
    const diffService = {
        sendViewerFile: vi.fn().mockResolvedValue(undefined),
        markReady: vi.fn().mockResolvedValue(undefined),
        forwardViewport: vi.fn().mockResolvedValue(undefined),
        forwardCursor: vi.fn().mockResolvedValue(undefined),
        rebroadcastLanguage: vi.fn(),
    };
    const notifier = new RecordingNotifier();
    const controller = new DiffController(store, notifier, fakePane, vsCodeModelerPreferences, {
        extension,
        createRouter: (extensions) => createDiffPaneRouter(diffService as never, extensions),
        rebroadcastLanguage: diffService.rebroadcastLanguage,
    });
    return { controller, store, diffService, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
    tabs.length = 0;
});

describe("DiffController.shouldResolveAsDiff", () => {
    it("returns false when a pane already exists for the URI (second resolve)", () => {
        const { controller, store } = createController();
        const value = "file:///repo/diagram.bpmn";
        const session = store.registerCompareFiles("git:/repo/diagram.bpmn", value);
        session.attachPane(new FakeDiffPaneHandle(value));

        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(false);
    });

    it("opens the file as an editor beside a diff tab that already shows it", () => {
        const { controller, store } = createController();
        const value = "file:///repo/diagram.bpmn";
        tabs.push({ input: undefined, label: "diagram.bpmn (Working Tree)" });
        const session = store.registerCompareFiles("git:/repo/diagram.bpmn", value);
        session.attachPane(new FakeDiffPaneHandle(value));

        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(false);
    });

    it("returns true for a pre-registered compare-files URI with no pane yet", () => {
        const { controller, store } = createController();
        const value = "file:///repo/diagram.bpmn";
        store.registerCompareFiles("git:/repo/diagram.bpmn", value);

        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(true);
    });

    it("returns true for a Git-provided scheme (git / gitfs)", () => {
        const { controller } = createController();
        expect(controller.shouldResolveAsDiff(uri("git", "git:/repo/a.bpmn"))).toBe(true);
        expect(controller.shouldResolveAsDiff(uri("gitfs", "gitfs:/repo/a.bpmn"))).toBe(true);
    });

    it("falls back to the diff-tab label heuristic for plain file URIs", () => {
        const { controller } = createController();
        const value = "file:///repo/diagram.bpmn";

        // No diff tab open → not a diff.
        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(false);

        // A label-only tab (input undefined) annotated like a diff → diff.
        tabs.push({ input: undefined, label: "diagram.bpmn (Working Tree)" });
        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(true);
    });

    it("reads the diff-tab label only for files of its own format", () => {
        const dmn = createController(".dmn").controller;
        const bpmn = createController(".bpmn").controller;
        tabs.push({ input: undefined, label: "shipping.dmn (Working Tree)" });

        expect(dmn.shouldResolveAsDiff(uri("file", "file:///repo/shipping.dmn"))).toBe(true);
        expect(bpmn.shouldResolveAsDiff(uri("file", "file:///repo/shipping.dmn"))).toBe(false);
    });

    it("opens an unrelated file as an editor while a compare tab is open", () => {
        const bpmn = createController(".bpmn").controller;
        const dmn = createController(".dmn").controller;
        tabs.push({ input: undefined, label: "a.bpmn ↔ b.bpmn" });

        expect(bpmn.shouldResolveAsDiff(uri("file", "file:///repo/c.bpmn"))).toBe(false);
        expect(dmn.shouldResolveAsDiff(uri("file", "file:///repo/shipping.dmn"))).toBe(false);
    });

    it("treats a file named on either side of a compare tab label as part of the diff", () => {
        const { controller } = createController();
        tabs.push({ input: undefined, label: "a.bpmn ↔ b.bpmn" });

        expect(controller.shouldResolveAsDiff(uri("file", "file:///repo/a.bpmn"))).toBe(true);
        expect(controller.shouldResolveAsDiff(uri("file", "file:///repo/b.bpmn"))).toBe(true);
    });

    it("ignores tabs that carry an input (regular editors, not diffs)", () => {
        const { controller } = createController();
        const value = "file:///repo/diagram.bpmn";
        tabs.push({ input: {}, label: "diagram.bpmn (Working Tree)" });

        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(false);
    });
});

describe("DiffController.openCompareFilesDiff", () => {
    it("registers the session before invoking vscode.diff", async () => {
        const { controller, store } = createController();

        await controller.openCompareFilesDiff(
            uri("file", "file:///a.bpmn"),
            uri("file", "file:///b.bpmn"),
        );

        // The session must exist by the time vscode.diff resolves the panes,
        // otherwise pane lookup falls through to the SCM heuristic.
        expect(store.findByUri("file:///a.bpmn")).toBeDefined();
        expect(commands.executeCommand).toHaveBeenCalledWith(
            "vscode.diff",
            expect.anything(),
            expect.anything(),
            compareTabLabel("a.bpmn", "b.bpmn"),
            { preview: false },
        );
    });

    it("surfaces vscode.diff failures through the notifier instead of throwing", async () => {
        const { controller, notifier } = createController();
        const boom = new Error("boom");
        vi.mocked(commands.executeCommand).mockRejectedValueOnce(boom);

        await expect(
            controller.openCompareFilesDiff(
                uri("file", "file:///a.bpmn"),
                uri("file", "file:///b.bpmn"),
            ),
        ).resolves.toBeUndefined();

        expect(notifier.logged("error")).toEqual([boom.stack]);
        expect(notifier.errors).toEqual(["Failed to open compare view: boom"]);
    });
});

describe("DiffController.resolveDiffPane", () => {
    it("attaches a compare-files pane to its session and bootstraps the webview", () => {
        const { controller, store } = createController();
        store.registerCompareFiles("file:///a.bpmn", "file:///b.bpmn");
        const { panel } = fakePanel();

        controller.resolveDiffPane(panel, fakeDoc("file", "/a.bpmn", "file:///a.bpmn"));

        expect(store.paneCountFor("file:///a.bpmn")).toBe(1);
        expect(bootstrapSpy).toHaveBeenCalled();
    });

    it("pairs two SCM panes sharing a path into a single session", () => {
        const { controller, store } = createController();

        // First (git) pane has no session yet → parked as pending.
        controller.resolveDiffPane(fakePanel().panel, fakeDoc("git", "/x.bpmn", "git:/x.bpmn"));
        expect(store.findByUri("git:/x.bpmn")).toBeUndefined();

        // Second (working-tree) pane shares the path → the pair forms a session
        // reachable from both URIs.
        controller.resolveDiffPane(fakePanel().panel, fakeDoc("file", "/x.bpmn", "file:///x.bpmn"));
        expect(store.findByUri("file:///x.bpmn")).toBeDefined();
        expect(store.findByUri("git:/x.bpmn")).toBeDefined();
    });

    it("gives a second diff tab of the same file a session of its own", () => {
        const { controller, store } = createController();
        const open = () => {
            tabs.push({ input: undefined, label: "x.bpmn (Working Tree)" });
            const git = fakePanel();
            controller.resolveDiffPane(git.panel, fakeDoc("git", "/x.bpmn", "git:/x.bpmn"));
            const fileUri = uri("file", "file:///x.bpmn");
            const resolvesAsDiff = controller.shouldResolveAsDiff(fileUri);
            controller.resolveDiffPane(
                fakePanel().panel,
                fakeDoc("file", "/x.bpmn", "file:///x.bpmn"),
            );
            return resolvesAsDiff;
        };

        const first = open();
        const second = open();

        expect([first, second]).toEqual([true, true]);
        const sessions = [...store.allSessions()];
        expect(sessions).toHaveLength(2);
        expect(sessions.every((session) => session.isEmpty() === false)).toBe(true);
        expect(sessions[0]!.attachedPanes()).not.toContain(sessions[1]!.after());
    });

    it("retires the session once its last pane is disposed", () => {
        const { controller, store } = createController();
        store.registerCompareFiles("file:///a.bpmn", "file:///b.bpmn");
        const { panel, cbs } = fakePanel();
        controller.resolveDiffPane(panel, fakeDoc("file", "/a.bpmn", "file:///a.bpmn"));
        expect(store.findByUri("file:///a.bpmn")).toBeDefined();

        cbs.dispose?.();

        expect(store.findByUri("file:///a.bpmn")).toBeUndefined();
    });
});

describe("DiffController.resolveWhenDiffPane", () => {
    it("takes a diff pane over from the editor and bootstraps it", () => {
        const { controller, store } = createController();
        store.registerCompareFiles("file:///a.bpmn", "file:///b.bpmn");
        const { resolveWhenDiffPane } = controller;

        const handled = resolveWhenDiffPane(
            fakeDoc("file", "/a.bpmn", "file:///a.bpmn"),
            fakePanel().panel,
        );

        expect(handled).toBe(true);
        expect(store.paneCountFor("file:///a.bpmn")).toBe(1);
        expect(bootstrapSpy).toHaveBeenCalled();
    });

    it("leaves a file outside any diff to the editor", () => {
        const { controller, store } = createController();
        const { resolveWhenDiffPane } = controller;

        const handled = resolveWhenDiffPane(
            fakeDoc("file", "/c.bpmn", "file:///c.bpmn"),
            fakePanel().panel,
        );

        expect(handled).toBe(false);
        expect(store.paneCountFor("file:///c.bpmn")).toBe(0);
        expect(bootstrapSpy).not.toHaveBeenCalled();
    });
});

describe("DiffController message dispatch", () => {
    /** Resolves a pane and returns the captured webview message handler. */
    function paneWithMessageHandler() {
        const ctx = createController();
        const { panel, cbs } = fakePanel();
        ctx.controller.resolveDiffPane(panel, fakeDoc("git", "/m.bpmn", "git:/m.bpmn"));
        return { ...ctx, send: (m: unknown) => cbs.message?.(m) };
    }

    it("routes each webview command to its diff-service method", async () => {
        const { diffService, send } = paneWithMessageHandler();

        await send({ type: "GetBpmnFileCommand" });
        expect(diffService.sendViewerFile).toHaveBeenCalled();

        await send({ type: "DiffReadyCommand" });
        expect(diffService.markReady).toHaveBeenCalled();

        await send({ type: "ViewportChangedCommand", viewport: { scrollX: 1 } });
        expect(diffService.forwardViewport).toHaveBeenCalledWith(expect.anything(), {
            scrollX: 1,
        });

        await send({ type: "CursorChangedCommand", index: 3 });
        expect(diffService.forwardCursor).toHaveBeenCalledWith(expect.anything(), 3);
    });

    it("logs a pane's error under the pane's file name", async () => {
        const { notifier, send } = paneWithMessageHandler();

        await send({ type: "LogErrorCommand", message: "import failed" });

        expect(notifier.logged("error")).toEqual(["[webview:m.bpmn] import failed"]);
    });

    it("ignores unknown command types", async () => {
        const { diffService, send } = paneWithMessageHandler();

        await send({ type: "NotAThing" });

        expect(diffService.sendViewerFile).not.toHaveBeenCalled();
        expect(diffService.markReady).not.toHaveBeenCalled();
    });
});

describe("DiffController.swapCompareFilesSides", () => {
    it("reopens a compare-files diff with the sides reversed", async () => {
        const { controller, store } = createController();
        store.registerCompareFiles("file:///a.bpmn", "file:///b.bpmn");
        const { panel, cbs } = fakePanel();
        controller.resolveDiffPane(panel, fakeDoc("file", "/a.bpmn", "file:///a.bpmn"));
        vi.mocked(commands.executeCommand).mockClear();

        await cbs.message?.({ type: "SwapCompareSidesCommand" });

        // before=a / after=b → the reopened diff swaps them: after on the left.
        const call = vi
            .mocked(commands.executeCommand)
            .mock.calls.find((c) => c[0] === "vscode.diff");
        expect((call?.[1] as { toString(): string }).toString()).toBe("file:///b.bpmn");
        expect((call?.[2] as { toString(): string }).toString()).toBe("file:///a.bpmn");
    });

    it("does nothing for a pane with no session", async () => {
        const { controller } = createController();
        const { cbs } = fakePanel();
        // A lone SCM pane never pairs, so it has no session.
        controller.resolveDiffPane(fakePanel().panel, fakeDoc("git", "/p.bpmn", "git:/p.bpmn"));
        const isolated = fakePanel();
        controller.resolveDiffPane(isolated.panel, fakeDoc("git", "/q.bpmn", "git:/q.bpmn"));
        vi.mocked(commands.executeCommand).mockClear();

        await isolated.cbs.message?.({ type: "SwapCompareSidesCommand" });
        // Reference cbs so the unused-binding lint stays quiet without altering intent.
        void cbs;

        expect(commands.executeCommand).not.toHaveBeenCalled();
    });

    it("does nothing for an SCM session (swap is compare-files only)", async () => {
        const { controller, store } = createController();
        controller.resolveDiffPane(fakePanel().panel, fakeDoc("git", "/s.bpmn", "git:/s.bpmn"));
        const file = fakePanel();
        controller.resolveDiffPane(file.panel, fakeDoc("file", "/s.bpmn", "file:///s.bpmn"));
        expect(store.findByUri("file:///s.bpmn")).toBeDefined();
        vi.mocked(commands.executeCommand).mockClear();

        await file.cbs.message?.({ type: "SwapCompareSidesCommand" });

        expect(commands.executeCommand).not.toHaveBeenCalled();
    });
});

describe("DiffController configuration", () => {
    it("registers a configuration listener on the extension context", () => {
        const { controller } = createController();
        const subscription = { dispose: vi.fn() };
        vi.mocked(workspace.onDidChangeConfiguration).mockReturnValueOnce(subscription as never);
        const context = { subscriptions: [] as unknown[] };

        controller.register(context as never);

        expect(workspace.onDidChangeConfiguration).toHaveBeenCalled();
        expect(context.subscriptions).toContain(subscription);
    });

    it("rebroadcasts the language only when the language setting changes", () => {
        const { controller, diffService } = createController();
        let handler: (event: { affectsConfiguration(key: string): boolean }) => void = () => {};
        vi.mocked(workspace.onDidChangeConfiguration).mockImplementation((cb) => {
            handler = cb as never;
            return { dispose: vi.fn() } as never;
        });
        controller.register({ subscriptions: [] } as never);

        handler({ affectsConfiguration: () => false });
        expect(diffService.rebroadcastLanguage).not.toHaveBeenCalled();

        handler({ affectsConfiguration: (key) => key === "miragon.bpmnModeler.language" });
        expect(diffService.rebroadcastLanguage).toHaveBeenCalled();
    });
});
