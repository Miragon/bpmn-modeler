import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: { joinPath: vi.fn(() => ({})) },
    window: { registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })) },
    commands: { registerCommand: vi.fn(() => ({ dispose: vi.fn() })) },
}));
vi.mock("../infrastructure/DeploymentWebviewHtml", () => ({
    deploymentWebviewHtml: vi.fn(() => "<html></html>"),
}));
vi.mock("../../shared/infrastructure/extensionContext", () => ({
    getContext: vi.fn(() => ({ extensionUri: {} })),
}));

import { commands, window } from "vscode";
import { DeploymentFeature } from "@miragon/bpmn-modeler-core";
import { type Command, type Query } from "@miragon/bpmn-modeler-shared";
import {
    DeploymentController,
    DEPLOY_CMD,
    DEPLOY_FILES_CMD,
    DEPLOYMENT_STATUS_MENU_CMD,
    SWITCH_TARGET_CMD,
    VERIFY_DEPLOYMENT_CMD,
} from "./DeploymentController";

function createWebviewView() {
    return {
        visible: true,
        webview: { options: {}, html: "", postMessage: vi.fn(), onDidReceiveMessage: vi.fn() },
        onDidChangeVisibility: vi.fn(),
        onDidDispose: vi.fn(),
    };
}

function createController() {
    const panel = {
        handle: vi.fn().mockResolvedValue(undefined),
        setVisible: vi.fn(),
        dispose: vi.fn(),
    };
    const feature = {
        deployActive: vi.fn(),
        switchTarget: vi.fn(),
        deployFiles: vi.fn(),
        verify: vi.fn(),
        statusMenu: vi.fn(),
        attachPanel: vi.fn<(post: (message: Query) => void, visible: boolean) => typeof panel>(
            () => panel,
        ),
    };
    const controller = new DeploymentController(feature as unknown as DeploymentFeature);
    return { controller, feature, panel };
}

function resolveView(controller: DeploymentController, visible = true) {
    const view = createWebviewView();
    view.visible = visible;
    controller.resolveWebviewView(view as never, {} as never, {} as never);
    return view;
}

function registeredHandler(commandId: string): () => unknown {
    const call = vi.mocked(commands.registerCommand).mock.calls.find(([id]) => id === commandId);
    if (!call) throw new Error(`No handler registered for ${commandId}`);
    return call[1] as () => unknown;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("DeploymentController.register", () => {
    it("registers the webview view provider and the five deployment commands", () => {
        const { controller } = createController();
        const context = { subscriptions: [] as unknown[] };

        controller.register(context as never);

        expect(window.registerWebviewViewProvider).toHaveBeenCalledWith(
            "bpmn-modeler.deploymentView",
            controller,
            { webviewOptions: { retainContextWhenHidden: true } },
        );
        expect(context.subscriptions).toHaveLength(6);
    });

    it.each([
        [DEPLOY_CMD, "deployActive"],
        [SWITCH_TARGET_CMD, "switchTarget"],
        [DEPLOY_FILES_CMD, "deployFiles"],
        [VERIFY_DEPLOYMENT_CMD, "verify"],
        [DEPLOYMENT_STATUS_MENU_CMD, "statusMenu"],
    ] as const)("maps %s onto the feature's %s", (commandId, method) => {
        const { controller, feature } = createController();
        controller.register({ subscriptions: [] } as never);

        registeredHandler(commandId)();

        expect(feature[method]).toHaveBeenCalledOnce();
        expect(feature[method]).toHaveBeenCalledWith();
    });
});

describe("DeploymentController.resolveWebviewView", () => {
    it.each([true, false])("attaches the panel with the view's visibility (%s)", (visible) => {
        const { controller, feature } = createController();

        resolveView(controller, visible);

        expect(feature.attachPanel).toHaveBeenCalledWith(expect.any(Function), visible);
    });

    it("posts the panel's queries to the webview", () => {
        const { controller, feature } = createController();
        const view = resolveView(controller);
        const [post] = feature.attachPanel.mock.calls[0];
        const query = { type: "FormDefaultsQuery" } as Query;

        post(query);

        expect(view.webview.postMessage).toHaveBeenCalledWith(query);
    });

    it("forwards received messages to the panel and returns its promise", () => {
        const { controller, panel } = createController();
        const handled = Promise.resolve();
        panel.handle.mockReturnValue(handled);
        const view = resolveView(controller);
        const receive = view.webview.onDidReceiveMessage.mock.calls[0][0];
        const message = { type: "GetFormDefaultsCommand" } as unknown as Command;

        const result = receive(message);

        expect(panel.handle).toHaveBeenCalledWith(message);
        expect(result).toBe(handled);
    });

    it("maps visibility changes onto the panel", () => {
        const { controller, panel } = createController();
        const view = resolveView(controller);
        const onVisibilityChange = view.onDidChangeVisibility.mock.calls[0][0];

        view.visible = false;
        onVisibilityChange();
        view.visible = true;
        onVisibilityChange();

        expect(panel.setVisible.mock.calls).toEqual([[false], [true]]);
    });

    it("disposes the panel when the view is disposed", () => {
        const { controller, panel } = createController();
        const view = resolveView(controller);

        view.onDidDispose.mock.calls[0][0]();

        expect(panel.dispose).toHaveBeenCalledOnce();
    });
});
