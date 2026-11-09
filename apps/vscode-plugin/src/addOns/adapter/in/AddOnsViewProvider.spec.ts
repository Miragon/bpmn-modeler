import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: vi.fn((base: { path: string }, ...segments: string[]) => ({
            path: [base.path, ...segments].join("/"),
        })),
    },
    window: { registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })) },
    commands: { registerCommand: vi.fn(() => ({ dispose: vi.fn() })) },
}));
vi.mock("./AddOnsViewHtml", () => ({
    addOnsViewHtml: vi.fn(() => "<html>artifacts</html>"),
}));

import { commands, window } from "vscode";
import { AddOnsFeature } from "@miragon/bpmn-modeler-core";
import { type Command, type Query } from "@miragon/bpmn-modeler-shared";
import { ADD_ONS_VIEW_ID, REFRESH_ADD_ONS_CMD } from "../../domain/addOnsViewIds";
import { addOnsViewHtml } from "./AddOnsViewHtml";
import { AddOnsViewProvider } from "./AddOnsViewProvider";

function createWebviewView(visible: boolean) {
    return {
        visible,
        webview: { options: {}, html: "", postMessage: vi.fn(), onDidReceiveMessage: vi.fn() },
        onDidChangeVisibility: vi.fn(),
        onDidDispose: vi.fn(),
    };
}

function createProvider() {
    const panel = {
        handle: vi.fn().mockResolvedValue(undefined),
        setVisible: vi.fn(),
        dispose: vi.fn(),
    };
    const addOns = {
        refresh: vi.fn(),
        attachPanel: vi.fn<(post: (message: Query) => void, visible: boolean) => typeof panel>(
            () => panel,
        ),
    };
    const extensionUri = { path: "/extension" };
    const provider = new AddOnsViewProvider(
        addOns as unknown as AddOnsFeature,
        extensionUri as never,
        () => "n0nce",
    );
    return { provider, addOns, panel, extensionUri };
}

function resolveView(provider: AddOnsViewProvider, visible = true) {
    const view = createWebviewView(visible);
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    return view;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("AddOnsViewProvider.register", () => {
    it("registers the Artifacts view, kept while hidden, and its refresh command", () => {
        const { provider } = createProvider();
        const context = { subscriptions: [] as unknown[] };

        provider.register(context as never);

        expect(window.registerWebviewViewProvider).toHaveBeenCalledWith(ADD_ONS_VIEW_ID, provider, {
            webviewOptions: { retainContextWhenHidden: true },
        });
        expect(vi.mocked(commands.registerCommand).mock.calls.map(([id]) => id)).toEqual([
            REFRESH_ADD_ONS_CMD,
        ]);
        expect(context.subscriptions).toHaveLength(2);
    });

    it("reads everything again on the title bar's refresh", () => {
        const { provider, addOns } = createProvider();
        provider.register({ subscriptions: [] } as never);
        const [, refresh] = vi.mocked(commands.registerCommand).mock.calls[0];

        refresh();

        expect(addOns.refresh).toHaveBeenCalledOnce();
    });
});

describe("AddOnsViewProvider.resolveWebviewView", () => {
    it("runs scripts only from the bundled add-ons webview and serves its shell", () => {
        const { provider, extensionUri } = createProvider();

        const view = resolveView(provider);

        expect(view.webview.options).toEqual({
            enableScripts: true,
            localResourceRoots: [{ path: "/extension/add-ons-webview" }],
        });
        expect(addOnsViewHtml).toHaveBeenCalledWith(view.webview, extensionUri, "n0nce");
        expect(view.webview.html).toBe("<html>artifacts</html>");
    });

    it.each([true, false])("attaches a panel with the view's visibility (%s)", (visible) => {
        const { provider, addOns } = createProvider();

        resolveView(provider, visible);

        expect(addOns.attachPanel).toHaveBeenCalledWith(expect.any(Function), visible);
    });

    it("posts the panel's queries to the webview", () => {
        const { provider, addOns } = createProvider();
        const view = resolveView(provider);
        const [post] = addOns.attachPanel.mock.calls[0];
        const query = { type: "AddOnCatalogQuery" } as Query;

        post(query);

        expect(view.webview.postMessage).toHaveBeenCalledWith(query);
    });

    it("hands the page's commands to the panel and returns its promise", () => {
        const { provider, panel } = createProvider();
        const handled = Promise.resolve();
        panel.handle.mockReturnValue(handled);
        const view = resolveView(provider);
        const receive = view.webview.onDidReceiveMessage.mock.calls[0][0];
        const message = { type: "GetAddOnCatalogCommand" } as unknown as Command;

        const result = receive(message);

        expect(panel.handle).toHaveBeenCalledWith(message);
        expect(result).toBe(handled);
    });

    it("tells the panel when the view is hidden and shown", () => {
        const { provider, panel } = createProvider();
        const view = resolveView(provider);
        const onVisibilityChange = view.onDidChangeVisibility.mock.calls[0][0];

        view.visible = false;
        onVisibilityChange();
        view.visible = true;
        onVisibilityChange();

        expect(panel.setVisible.mock.calls).toEqual([[false], [true]]);
    });

    it("detaches the panel when the view is disposed", () => {
        const { provider, panel } = createProvider();
        const view = resolveView(provider);

        view.onDidDispose.mock.calls[0][0]();

        expect(panel.dispose).toHaveBeenCalledOnce();
    });
});
