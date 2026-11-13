import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: vi.fn((base: { path: string }, ...segments: string[]) => ({
            path: [base.path, ...segments].join("/"),
        })),
    },
    ViewColumn: { Active: -1 },
    window: { createWebviewPanel: vi.fn() },
}));
vi.mock("./AddOnsViewHtml", () => ({
    addOnsViewHtml: vi.fn(() => "<html>detail</html>"),
}));

import { window } from "vscode";
import type { AddOnsFeature } from "@miragon/bpmn-modeler-core";
import { BrandModeQuery, type BrandMode } from "@miragon/bpmn-modeler-shared";
import { ADD_ON_DETAIL_VIEW_TYPE, AddOnDetailTab } from "./AddOnDetailTab";
import { addOnsViewHtml } from "./AddOnsViewHtml";

const RESIZE = { addOnId: "plugin:/work/resize", title: "Add-on: Resize Tasks" };
const PALETTE = { addOnId: "plugin:/work/palette", title: "Add-on: Palette" };

/** A WebviewPanel whose events the test fires. */
function fakeWebviewPanel() {
    const handlers: Record<string, (value?: unknown) => unknown> = {};
    const on = (name: string) =>
        vi.fn((handler: (value?: unknown) => unknown) => {
            handlers[name] = handler;
            return { dispose: vi.fn() };
        });
    return {
        title: "",
        visible: true,
        handlers,
        webview: { html: "", postMessage: vi.fn(), onDidReceiveMessage: on("message") },
        onDidChangeViewState: on("viewState"),
        onDidDispose: on("dispose"),
        reveal: vi.fn(),
        dispose: vi.fn(),
    };
}

function setUp() {
    const webviewPanel = fakeWebviewPanel();
    vi.mocked(window.createWebviewPanel).mockReturnValue(webviewPanel as never);
    const panel = { handle: vi.fn(), setVisible: vi.fn(), show: vi.fn(), dispose: vi.fn() };
    const addOns = { attachPanel: vi.fn(() => panel) };
    const changes = new Set<(mode: BrandMode) => void>();
    const brandMode = {
        current: (): BrandMode => ({ theme: "dark" }),
        onDidChange: (listener: (mode: BrandMode) => void) => {
            changes.add(listener);
            return { dispose: () => changes.delete(listener) };
        },
    };
    const subscriptions: { dispose(): void }[] = [];
    const tab = new AddOnDetailTab(
        { subscriptions },
        addOns as unknown as AddOnsFeature,
        { path: "/extension" } as never,
        () => "n0nce",
        brandMode,
    );
    return { tab, webviewPanel, panel, addOns, changes, subscriptions };
}

beforeEach(() => vi.clearAllMocks());

describe("AddOnDetailTab", () => {
    it("opens one tab with the core's title, serving the detail page of the add-on", () => {
        const { tab, webviewPanel, addOns, subscriptions } = setUp();

        tab.show(RESIZE);

        expect(window.createWebviewPanel).toHaveBeenCalledWith(
            ADD_ON_DETAIL_VIEW_TYPE,
            RESIZE.title,
            { viewColumn: -1, preserveFocus: false },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [{ path: "/extension/add-ons-webview" }],
            },
        );
        expect(addOnsViewHtml).toHaveBeenCalledWith(
            webviewPanel.webview,
            { path: "/extension" },
            "n0nce",
            { theme: "dark" },
            "detail",
        );
        expect(addOns.attachPanel).toHaveBeenCalledWith(expect.any(Function), true, {
            shows: RESIZE.addOnId,
        });
        expect(subscriptions).toEqual([webviewPanel]);
    });

    it("shows the next add-on in the same tab and brings it to the front", () => {
        const { tab, webviewPanel, panel } = setUp();
        tab.show(RESIZE);

        tab.show(PALETTE);

        expect([
            vi.mocked(window.createWebviewPanel).mock.calls.length,
            webviewPanel.title,
            panel.show.mock.calls,
            webviewPanel.reveal.mock.calls,
        ]).toEqual([1, PALETTE.title, [[PALETTE.addOnId]], [[undefined, false]]]);
    });

    it("hands the page's commands to the core, with the brand mode and focus once it loads", async () => {
        const { tab, webviewPanel, panel } = setUp();
        tab.show(RESIZE);
        const command = { type: "GetAddOnCatalogCommand" };

        await webviewPanel.handlers.message(command);
        await webviewPanel.handlers.message(command);

        expect([
            panel.handle.mock.calls,
            webviewPanel.webview.postMessage.mock.calls,
            webviewPanel.reveal.mock.calls,
        ]).toEqual([
            [[command], [command]],
            [[new BrandModeQuery({ theme: "dark" })], [new BrandModeQuery({ theme: "dark" })]],
            [[undefined, false]],
        ]);
    });

    it("follows the tab's visibility and a theme switch", () => {
        const { tab, webviewPanel, panel, changes } = setUp();
        tab.show(RESIZE);

        webviewPanel.visible = false;
        webviewPanel.handlers.viewState();
        changes.forEach((listener) => listener({ theme: "light" }));

        expect([panel.setVisible.mock.calls, webviewPanel.webview.postMessage.mock.calls]).toEqual([
            [[false]],
            [[new BrandModeQuery({ theme: "light" })]],
        ]);
    });

    it("lets go of its page when the user closes the tab, and opens a new tab next time", () => {
        const { tab, webviewPanel, panel, changes } = setUp();
        tab.show(RESIZE);

        webviewPanel.handlers.dispose();
        tab.show(PALETTE);

        expect([
            panel.dispose.mock.calls.length,
            changes.size,
            vi.mocked(window.createWebviewPanel).mock.calls.length,
        ]).toEqual([1, 1, 2]);
    });
});
