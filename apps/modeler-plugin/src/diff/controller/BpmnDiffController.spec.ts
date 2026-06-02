import { beforeEach, describe, expect, it, vi } from "vitest";

// `window.tabGroups.all` is the only vscode value `shouldResolveAsDiff` reads;
// a mutable `tabs` array lets each test stage the label heuristic. `vi.hoisted`
// keeps it usable inside the (hoisted) `vi.mock` factory.
const { tabs } = vi.hoisted(() => ({ tabs: [] as { input: unknown; label: string }[] }));
vi.mock("vscode", () => ({
    window: { tabGroups: { all: [{ tabs }] } },
    workspace: { onDidChangeConfiguration: vi.fn() },
    commands: { executeCommand: vi.fn() },
    Uri: { parse: (value: string) => ({ scheme: value.split(":")[0], toString: () => value }) },
}));

// `resolveDiffPane` wraps the panel/document in a WebviewPaneHandle and hands
// the finished HTML to `bootstrapWebview`; both reach into `vscode`, so stub
// them to keep the controller unit isolated. The handle stub mirrors the real
// one's shape — `uri` derived from the document — so the store's URI lookups
// still match.
vi.mock("../../shared/infrastructure/bootstrapWebview", () => ({
    bootstrapWebview: vi.fn(),
}));
vi.mock("../infrastructure/WebviewPaneHandle", () => ({
    // A regular function (not an arrow) so `new WebviewPaneHandle(...)` works:
    // returning an object from a constructor makes that object the instance.
    WebviewPaneHandle: vi.fn(function (_panel: never, document: { uri: { toString(): string } }) {
        return {
            uri: document.uri.toString(),
            document,
            isReady: () => false,
            setReady: vi.fn(),
            getText: () => "",
            postMessage: vi.fn().mockResolvedValue(true),
            dispose: vi.fn(),
        };
    }),
}));

import { commands, workspace } from "vscode";

import { bootstrapWebview } from "../../shared/infrastructure/bootstrapWebview";
import { DiffPaneStore } from "../infrastructure/DiffPaneStore";
import { BpmnDiffController } from "./BpmnDiffController";

/** Minimal vscode `Uri` stand-in carrying the two fields the controller reads. */
function uri(scheme: string, value: string) {
    return { scheme, toString: () => value } as never;
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

function createController() {
    const store = new DiffPaneStore();
    const diffService = {
        sendViewerFile: vi.fn().mockResolvedValue(undefined),
        markReady: vi.fn().mockResolvedValue(undefined),
        forwardViewport: vi.fn().mockResolvedValue(undefined),
        forwardCursor: vi.fn().mockResolvedValue(undefined),
        rebroadcastLanguage: vi.fn(),
    };
    const notifier = { logError: vi.fn(), showError: vi.fn(), showInfo: vi.fn() };
    const controller = new BpmnDiffController(store, diffService as never, notifier as never);
    return { controller, store, diffService, notifier };
}

beforeEach(() => {
    // clearAllMocks wipes call history but preserves the module-mock
    // implementations (WebviewPaneHandle / bootstrapWebview); resetAllMocks
    // would strip those and break resolveDiffPane.
    vi.clearAllMocks();
    tabs.length = 0;
});

describe("BpmnDiffController.shouldResolveAsDiff", () => {
    it("returns false when a pane already exists for the URI (second resolve)", () => {
        const { controller, store } = createController();
        const value = "file:///repo/diagram.bpmn";
        const session = store.registerCompareFiles("git:/repo/diagram.bpmn", value);
        session.attachPane({
            uri: value,
            isReady: () => false,
            setReady: vi.fn(),
            getText: () => "",
            postMessage: vi.fn().mockResolvedValue(true),
            dispose: vi.fn(),
        });

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

    it("ignores tabs that carry an input (regular editors, not diffs)", () => {
        const { controller } = createController();
        const value = "file:///repo/diagram.bpmn";
        tabs.push({ input: {}, label: "diagram.bpmn (Working Tree)" });

        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(false);
    });
});

describe("BpmnDiffController.openCompareFilesDiff", () => {
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
            expect.any(String),
            { preview: false },
        );
    });

    it("surfaces vscode.diff failures through the notifier instead of throwing", async () => {
        const { controller, notifier } = createController();
        vi.mocked(commands.executeCommand).mockRejectedValueOnce(new Error("boom"));

        await expect(
            controller.openCompareFilesDiff(
                uri("file", "file:///a.bpmn"),
                uri("file", "file:///b.bpmn"),
            ),
        ).resolves.toBeUndefined();

        expect(notifier.logError).toHaveBeenCalled();
        expect(notifier.showError).toHaveBeenCalledWith(expect.stringContaining("boom"));
    });
});

describe("BpmnDiffController.resolveDiffPane", () => {
    it("attaches a compare-files pane to its session and bootstraps the webview", () => {
        const { controller, store } = createController();
        store.registerCompareFiles("file:///a.bpmn", "file:///b.bpmn");
        const { panel } = fakePanel();

        controller.resolveDiffPane(panel, fakeDoc("file", "/a.bpmn", "file:///a.bpmn"));

        expect(store.hasPaneForUri("file:///a.bpmn")).toBe(true);
        expect(bootstrapWebview).toHaveBeenCalled();
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

describe("BpmnDiffController message dispatch", () => {
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

    it("ignores unknown command types", async () => {
        const { diffService, send } = paneWithMessageHandler();

        await send({ type: "NotAThing" });

        expect(diffService.sendViewerFile).not.toHaveBeenCalled();
        expect(diffService.markReady).not.toHaveBeenCalled();
    });
});

describe("BpmnDiffController.swapCompareFilesSides", () => {
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

describe("BpmnDiffController configuration", () => {
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
