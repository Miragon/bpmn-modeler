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
import {
    DeploymentResult,
    DeploymentTarget,
    DeploymentTargetIdentity,
} from "@miragon/bpmn-modeler-core";
import {
    DeploymentResultQuery,
    type Command,
    type DeployCommand,
} from "@miragon/bpmn-modeler-shared";
import {
    DeploymentController,
    DEPLOY_CMD,
    DEPLOYMENT_STATUS_MENU_CMD,
    VERIFY_DEPLOYMENT_CMD,
} from "./DeploymentController";

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
    const deploymentTargetService = {
        listTargets: vi.fn().mockResolvedValue([]),
        getActiveTarget: vi.fn().mockResolvedValue(undefined),
        resolveSlot: vi.fn().mockResolvedValue(undefined),
        switchActiveTarget: vi.fn().mockResolvedValue(undefined),
        getCredentials: vi.fn(),
    };
    const deploymentStatusService = {
        refresh: vi.fn().mockResolvedValue(undefined),
        refreshActive: vi.fn().mockResolvedValue(undefined),
        hide: vi.fn(),
        pickStatusBarAction: vi.fn().mockResolvedValue(undefined),
        targetIdentity: vi.fn(async (target: DeploymentTarget) =>
            DeploymentTargetIdentity.fromTarget(target, () => undefined),
        ),
        adHocIdentity: vi.fn(async (endpoint: string, tenantId: string) =>
            DeploymentTargetIdentity.adHoc(endpoint, tenantId, () => undefined),
        ),
    };
    const verificationService = {
        verifyActive: vi.fn().mockResolvedValue(undefined),
    };
    const deployActiveDiagramService = {
        deployActive: vi.fn().mockResolvedValue(undefined),
    };
    const picker = {
        pickWorkspaceFiles: vi.fn().mockResolvedValue([]),
    };
    const notifier = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        notifyError: vi.fn(),
        logDebug: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
        withProgress: vi.fn((_title: string, task: () => Promise<unknown>) => task()),
    };

    const postMessage = vi.fn();
    const onDidReceiveMessage = vi.fn();
    const onDidChangeVisibility = vi.fn();
    const onDidDispose = vi.fn();
    const webviewView = {
        visible: true,
        webview: { options: {}, html: "", postMessage, onDidReceiveMessage },
        onDidChangeVisibility,
        onDidDispose,
    };

    const controller = new DeploymentController(
        editorStore as never,
        vsDocument as never,
        deploymentService as never,
        startInstanceService as never,
        deploymentTargetService as never,
        deploymentStatusService as never,
        verificationService as never,
        deployActiveDiagramService as never,
        picker as never,
        notifier as never,
    );

    return {
        controller,
        editorStore,
        vsDocument,
        deploymentService,
        startInstanceService,
        deploymentTargetService,
        deploymentStatusService,
        verificationService,
        deployActiveDiagramService,
        picker,
        notifier,
        webviewView,
        postMessage,
        onDidReceiveMessage,
        onDidChangeVisibility,
        onDidDispose,
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
        // View provider + deploy + switch-target + deploy-files + verify +
        // status-menu commands.
        expect(context.subscriptions).toHaveLength(6);
    });
});

describe("DeploymentController deployment verification commands", () => {
    /** Registers commands and returns the handler registered for `commandId`. */
    function registeredHandler(
        c: ReturnType<typeof createController>,
        commandId: string,
    ): () => Promise<void> {
        c.controller.register({ subscriptions: [] } as never);
        const call = vi
            .mocked(commands.registerCommand)
            .mock.calls.find(([id]) => id === commandId);
        if (!call) throw new Error(`No handler registered for ${commandId}`);
        return call[1] as () => Promise<void>;
    }

    it("deploys the active diagram against the active document's directory", async () => {
        const c = createController();

        await registeredHandler(c, DEPLOY_CMD)();

        expect(c.deployActiveDiagramService.deployActive).toHaveBeenCalledWith("/work/trusted");
    });

    it("verifies against the active document's directory", async () => {
        const c = createController();

        await registeredHandler(c, VERIFY_DEPLOYMENT_CMD)();

        expect(c.verificationService.verifyActive).toHaveBeenCalledWith("/work/trusted");
    });

    it("routes the status menu's switch action to the target switch", async () => {
        const c = createController();
        c.deploymentStatusService.pickStatusBarAction.mockResolvedValue("switch");

        await registeredHandler(c, DEPLOYMENT_STATUS_MENU_CMD)();

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith("/work/trusted");
        expect(c.verificationService.verifyActive).not.toHaveBeenCalled();
    });

    it("routes the status menu's verify action to the verification service", async () => {
        const c = createController();
        c.deploymentStatusService.pickStatusBarAction.mockResolvedValue("verify");

        await registeredHandler(c, DEPLOYMENT_STATUS_MENU_CMD)();

        expect(c.verificationService.verifyActive).toHaveBeenCalledWith("/work/trusted");
        expect(c.deploymentTargetService.switchActiveTarget).not.toHaveBeenCalled();
    });

    it("does nothing when the status menu is dismissed", async () => {
        const c = createController();

        await registeredHandler(c, DEPLOYMENT_STATUS_MENU_CMD)();

        expect(c.verificationService.verifyActive).not.toHaveBeenCalled();
        expect(c.deploymentTargetService.switchActiveTarget).not.toHaveBeenCalled();
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
            targetName: "",
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
