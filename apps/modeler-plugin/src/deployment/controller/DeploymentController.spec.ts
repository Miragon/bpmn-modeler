import { beforeEach, describe, expect, it, vi } from "vitest";

// The controller is now thin host glue: it builds a real
// `DeploymentMessageDispatcher` (whose behaviour is covered exhaustively by its
// own spec in `@miragon/bpmn-modeler-core`) and wires it to the VS Code
// `WebviewView`. These tests assert only that wiring — message forwarding,
// visibility / active-editor refresh, and registration. A minimal `vscode` mock
// plus stubbed HTML/context modules keep `resolveWebviewView` runnable headless.
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
import { DeploymentResult } from "@miragon/bpmn-modeler-core";
import {
    DeploymentResultQuery,
    type Command,
    type DeployCommand,
} from "@miragon/bpmn-modeler-shared";
import { DeploymentController, DEPLOY_CMD } from "./DeploymentController";

/**
 * Assembles the controller with structural port doubles and a fake `WebviewView`
 * that captures the message listener, the visibility listener, and posted queries.
 */
function createController() {
    const onDidChangeActiveEditor = vi.fn();
    const editorStore = {
        getActiveEditorId: vi.fn().mockReturnValue("editor-1"),
        onDidChangeActiveEditor,
    };
    const vsDocument = {
        getFilePath: vi.fn().mockReturnValue("/work/trusted/order-process.bpmn"),
    };
    const deploymentService = {
        deploy: vi.fn().mockResolvedValue(new DeploymentResult(true, "ok")),
        getFormDefaults: vi.fn().mockReturnValue({
            deploymentName: "order-process",
            tenantId: "",
            endpoint: "https://c/api",
            engine: "c7",
            authType: "none",
        }),
        getStoredCredentials: vi.fn(),
        selectAdditionalFiles: vi.fn(),
    };
    const startInstanceService = {
        startInstance: vi.fn(),
        getProcessDefinitionKey: vi.fn().mockReturnValue("proc-key"),
        selectPayloadFile: vi.fn(),
    };
    const notifier = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        logInfo: vi.fn(),
        logError: vi.fn(),
    };

    const postMessage = vi.fn();
    const onDidReceiveMessage = vi.fn();
    const onDidChangeVisibility = vi.fn();
    const webviewView = {
        visible: true,
        webview: { options: {}, html: "", postMessage, onDidReceiveMessage },
        onDidChangeVisibility,
    };

    const controller = new DeploymentController(
        editorStore as never,
        vsDocument as never,
        deploymentService as never,
        startInstanceService as never,
        notifier as never,
    );

    return {
        controller,
        editorStore,
        vsDocument,
        deploymentService,
        startInstanceService,
        notifier,
        webviewView,
        postMessage,
        onDidReceiveMessage,
        onDidChangeVisibility,
    };
}

/** Resolves the view and returns the registered inbound message handler. */
function resolveAndGetReceiver(
    c: ReturnType<typeof createController>,
): (m: Command) => Promise<void> {
    c.controller.resolveWebviewView(c.webviewView as never, {} as never, {} as never);
    return c.onDidReceiveMessage.mock.calls[0][0];
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("DeploymentController.register", () => {
    it("registers the webview view provider and the deploy command", () => {
        const c = createController();
        const context = { subscriptions: [] as unknown[] };

        c.controller.register(context as never);

        expect(window.registerWebviewViewProvider).toHaveBeenCalledWith(
            "bpmn-modeler.deploymentView",
            c.controller,
            { webviewOptions: { retainContextWhenHidden: true } },
        );
        expect(commands.registerCommand).toHaveBeenCalledWith(DEPLOY_CMD, expect.any(Function));
        expect(context.subscriptions).toHaveLength(2);
    });
});

describe("DeploymentController.resolveWebviewView", () => {
    it("forwards inbound webview messages to the dispatcher", async () => {
        const c = createController();
        const receive = resolveAndGetReceiver(c);

        const deployPayload: DeployCommand["config"] = {
            deploymentName: "order-process",
            tenantId: "",
            endpoint: "http://localhost:8080/engine-rest",
            engine: "c7",
            mainFilePath: "/work/order-process.bpmn",
            additionalFilePaths: [],
            auth: { authType: "none" },
        };

        await receive({ type: "DeployCommand", config: deployPayload } as DeployCommand);

        // Delegation reached the real dispatcher → service was invoked with the
        // trusted document path (not the payload's mainFilePath) and the result
        // was posted back to this view.
        expect(c.deploymentService.deploy).toHaveBeenCalledOnce();
        expect(c.deploymentService.deploy.mock.calls[0][0].mainFilePath).toBe(
            "/work/trusted/order-process.bpmn",
        );
        const posted = c.postMessage.mock.calls
            .map((call) => call[0])
            .find((q) => q instanceof DeploymentResultQuery);
        expect(posted?.success).toBe(true);
    });

    it("re-sends form defaults when the panel becomes visible", () => {
        const c = createController();
        c.controller.resolveWebviewView(c.webviewView as never, {} as never, {} as never);

        const onVisibility = c.onDidChangeVisibility.mock.calls[0][0];
        onVisibility();

        expect(c.deploymentService.getFormDefaults).toHaveBeenCalledWith("editor-1");
    });

    it("re-sends form defaults when the active editor changes while visible", () => {
        const c = createController();
        c.controller.resolveWebviewView(c.webviewView as never, {} as never, {} as never);

        const onActiveChange = c.editorStore.onDidChangeActiveEditor.mock.calls[0][0];
        onActiveChange();

        expect(c.deploymentService.getFormDefaults).toHaveBeenCalledWith("editor-1");
    });

    it("does not refresh defaults when the panel is hidden", () => {
        const c = createController();
        c.webviewView.visible = false;
        c.controller.resolveWebviewView(c.webviewView as never, {} as never, {} as never);

        c.onDidChangeVisibility.mock.calls[0][0]();
        c.editorStore.onDidChangeActiveEditor.mock.calls[0][0]();

        expect(c.deploymentService.getFormDefaults).not.toHaveBeenCalled();
    });
});
