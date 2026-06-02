import { beforeEach, describe, expect, it, vi } from "vitest";

// The subject imports only erased `vscode` *types* in the code paths exercised
// here (handlers + message routing); `register`/`resolveWebviewView`, which use
// real `window`/`commands`/`Uri` APIs, are never invoked. An empty module
// satisfies the import without pulling in the vscode runtime surface.
vi.mock("vscode", () => ({}));

import {
    AdditionalFilesQuery,
    DeploymentResultQuery,
    FormDefaultsQuery,
    ProcessDefinitionKeyQuery,
    SelectedPayloadFileQuery,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
    type AuthConfigPayload,
    type Command,
    type DeployCommand,
    type StartInstanceCommand,
} from "@miragon/bpmn-modeler-shared";
import { BasicAuth, DeploymentResult, NoAuth, OAuth2Auth } from "../domain/deployment";
import { StartInstanceResult } from "../domain/startInstance";
import { InvalidDeploymentConfigError } from "../../shared/domain/errors";
import { DeploymentController } from "./DeploymentController";

/**
 * Assembles the controller with structural port doubles. Each collaborator is a
 * bare `vi.fn()` record cast to its interface — the controller only calls these
 * methods, so structural doubles keep the test free of any vscode surface. The
 * fake `webviewView` exposes `postMessage` as a spy that captures every query
 * the controller sends back to the webview.
 */
function createController() {
    const editorStore = {
        getActiveEditorId: vi.fn().mockReturnValue("editor-1"),
        onDidChangeActiveEditor: vi.fn(),
    };
    // Deliberately distinct from the payload's `mainFilePath` so a regression
    // that trusts the webview payload instead of the document path is caught.
    const vsDocument = {
        getFilePath: vi.fn().mockReturnValue("/work/trusted/order-process.bpmn"),
    };
    const deploymentService = {
        deploy: vi.fn(),
        getFormDefaults: vi.fn(),
        getStoredCredentials: vi.fn(),
        selectAdditionalFiles: vi.fn(),
    };
    const startInstanceService = {
        startInstance: vi.fn(),
        getProcessDefinitionKey: vi.fn(),
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
    const webviewView = {
        visible: true,
        webview: { postMessage, onDidReceiveMessage },
        onDidChangeVisibility: vi.fn(),
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
    };
}

/** Finds the single posted message of a given query class among all postMessage calls. */
function postedQuery<T>(postMessage: ReturnType<typeof vi.fn>, type: new (...a: never[]) => T): T {
    const match = postMessage.mock.calls.map((c) => c[0]).find((q) => q instanceof type);
    if (!match) {
        throw new Error(`No posted message of type ${type.name}`);
    }
    return match as T;
}

const deployPayload = (auth: AuthConfigPayload): DeployCommand["config"] => ({
    deploymentName: "order-process",
    tenantId: "",
    endpoint: "http://localhost:8080/engine-rest",
    engine: "c7",
    mainFilePath: "/work/order-process.bpmn",
    additionalFilePaths: [],
    auth,
});

const startPayload = (auth: AuthConfigPayload): StartInstanceCommand["config"] => ({
    processDefinitionKey: "order-process",
    endpoint: "http://localhost:8080/engine-rest",
    engine: "c7",
    auth,
    payloadFilePath: "",
});

// The controller's auth-construction branch is private, so each test reads back
// the `AuthConfig` instance the service was called with to assert the mapping.
const callHandleDeploy = (c: ReturnType<typeof createController>, auth: AuthConfigPayload) =>
    (
        c.controller as never as { handleDeploy: (w: unknown, p: unknown) => Promise<void> }
    ).handleDeploy(c.webviewView, deployPayload(auth));

const callHandleStartInstance = (c: ReturnType<typeof createController>, auth: AuthConfigPayload) =>
    (
        c.controller as never as { handleStartInstance: (w: unknown, p: unknown) => Promise<void> }
    ).handleStartInstance(c.webviewView, startPayload(auth));

const callSendFormDefaults = (c: ReturnType<typeof createController>) =>
    (c.controller as never as { sendFormDefaults: (w: unknown) => void }).sendFormDefaults(
        c.webviewView,
    );

beforeEach(() => {
    vi.clearAllMocks();
});

describe("DeploymentController.handleDeploy auth construction", () => {
    it("builds a BasicAuth from a basic payload", async () => {
        const c = createController();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await callHandleDeploy(c, {
            authType: "basic",
            username: "admin",
            password: "secret",
        });

        const config = c.deploymentService.deploy.mock.calls[0][0];
        expect(config.auth).toBeInstanceOf(BasicAuth);
        expect(config.auth.username).toBe("admin");
        expect(config.auth.password).toBe("secret");
    });

    it("builds an OAuth2Auth from an oauth2 payload", async () => {
        const c = createController();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await callHandleDeploy(c, {
            authType: "oauth2",
            clientId: "cid",
            clientSecret: "csecret",
            tokenEndpoint: "https://idp/token",
            audience: "zeebe-api",
        });

        const config = c.deploymentService.deploy.mock.calls[0][0];
        expect(config.auth).toBeInstanceOf(OAuth2Auth);
        expect(config.auth.clientId).toBe("cid");
        expect(config.auth.tokenEndpoint).toBe("https://idp/token");
        expect(config.auth.audience).toBe("zeebe-api");
    });

    it("falls back to NoAuth for the none auth type", async () => {
        const c = createController();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await callHandleDeploy(c, { authType: "none" });

        const config = c.deploymentService.deploy.mock.calls[0][0];
        expect(config.auth).toBeInstanceOf(NoAuth);
    });

    it("deploys the trusted document path, never the webview payload's mainFilePath", async () => {
        const c = createController();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        // The payload carries `/work/order-process.bpmn`; the document resolves to
        // a different trusted path. The controller must use the latter so a
        // tampered payload can't redirect which file is deployed.
        await callHandleDeploy(c, { authType: "none" });

        const config = c.deploymentService.deploy.mock.calls[0][0];
        expect(c.vsDocument.getFilePath).toHaveBeenCalledWith("editor-1");
        expect(config.mainFilePath).toBe("/work/trusted/order-process.bpmn");
        expect(config.mainFilePath).not.toBe("/work/order-process.bpmn");
    });
});

describe("DeploymentController.handleDeploy result handling", () => {
    it("shows an info notification and posts a success result", async () => {
        const c = createController();
        c.deploymentService.deploy.mockResolvedValue(
            new DeploymentResult(true, "deployed", "dep-1"),
        );

        await callHandleDeploy(c, { authType: "none" });

        expect(c.notifier.showInfo).toHaveBeenCalledWith("deployed");
        expect(c.notifier.showError).not.toHaveBeenCalled();
        const query = postedQuery(c.postMessage, DeploymentResultQuery);
        expect(query.success).toBe(true);
        expect(query.message).toBe("deployed");
        expect(query.deploymentId).toBe("dep-1");
    });

    it("shows an error notification and posts a failure result", async () => {
        const c = createController();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(false, "rejected"));

        await callHandleDeploy(c, { authType: "none" });

        expect(c.notifier.showError).toHaveBeenCalledWith("rejected");
        expect(c.notifier.showInfo).not.toHaveBeenCalled();
        const query = postedQuery(c.postMessage, DeploymentResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe("rejected");
    });

    it("maps an InvalidDeploymentConfigError to its own message", async () => {
        const c = createController();
        const error = new InvalidDeploymentConfigError(["endpoint"]);
        c.deploymentService.deploy.mockRejectedValue(error);

        await callHandleDeploy(c, { authType: "none" });

        expect(c.notifier.showError).toHaveBeenCalledWith(error.message);
        expect(postedQuery(c.postMessage, DeploymentResultQuery).message).toBe(error.message);
    });

    it("maps any other thrown error to the generic deployment fallback", async () => {
        const c = createController();
        c.deploymentService.deploy.mockRejectedValue(new Error("network down"));

        await callHandleDeploy(c, { authType: "none" });

        const fallback = "An unexpected error occurred during deployment.";
        expect(c.notifier.showError).toHaveBeenCalledWith(fallback);
        const query = postedQuery(c.postMessage, DeploymentResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe(fallback);
    });
});

describe("DeploymentController.handleStartInstance auth construction", () => {
    it("builds a BasicAuth from a basic payload", async () => {
        const c = createController();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await callHandleStartInstance(c, {
            authType: "basic",
            username: "admin",
            password: "secret",
        });

        const auth = c.startInstanceService.startInstance.mock.calls[0][3];
        expect(auth).toBeInstanceOf(BasicAuth);
        expect(auth.username).toBe("admin");
    });

    it("builds an OAuth2Auth from an oauth2 payload", async () => {
        const c = createController();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await callHandleStartInstance(c, {
            authType: "oauth2",
            clientId: "cid",
            clientSecret: "csecret",
            tokenEndpoint: "https://idp/token",
            audience: "zeebe-api",
        });

        const auth = c.startInstanceService.startInstance.mock.calls[0][3];
        expect(auth).toBeInstanceOf(OAuth2Auth);
        expect(auth.clientId).toBe("cid");
    });

    it("falls back to NoAuth for the none auth type", async () => {
        const c = createController();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await callHandleStartInstance(c, { authType: "none" });

        expect(c.startInstanceService.startInstance.mock.calls[0][3]).toBeInstanceOf(NoAuth);
    });
});

describe("DeploymentController.handleStartInstance result handling", () => {
    it("shows an info notification and posts a success result", async () => {
        const c = createController();
        c.startInstanceService.startInstance.mockResolvedValue(
            new StartInstanceResult(true, "started", "pi-1"),
        );

        await callHandleStartInstance(c, { authType: "none" });

        expect(c.notifier.showInfo).toHaveBeenCalledWith("started");
        const query = postedQuery(c.postMessage, StartInstanceResultQuery);
        expect(query.success).toBe(true);
        expect(query.processInstanceId).toBe("pi-1");
    });

    it("shows an error notification and posts a failure result", async () => {
        const c = createController();
        c.startInstanceService.startInstance.mockResolvedValue(
            new StartInstanceResult(false, "no instance"),
        );

        await callHandleStartInstance(c, { authType: "none" });

        expect(c.notifier.showError).toHaveBeenCalledWith("no instance");
        expect(postedQuery(c.postMessage, StartInstanceResultQuery).success).toBe(false);
    });

    it("maps a thrown error to the generic start-instance fallback", async () => {
        const c = createController();
        c.startInstanceService.startInstance.mockRejectedValue(new Error("boom"));

        await callHandleStartInstance(c, { authType: "none" });

        const fallback = "An unexpected error occurred while starting the process instance.";
        expect(c.notifier.showError).toHaveBeenCalledWith(fallback);
        const query = postedQuery(c.postMessage, StartInstanceResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe(fallback);
    });
});

describe("DeploymentController.sendFormDefaults", () => {
    it("posts the service defaults and the process key for the active editor", () => {
        const c = createController();
        const defaults = {
            deploymentName: "order-process",
            tenantId: "",
            endpoint: "https://c/api",
            engine: "c8" as const,
            authType: "none" as const,
        };
        c.deploymentService.getFormDefaults.mockReturnValue(defaults);
        c.startInstanceService.getProcessDefinitionKey.mockReturnValue("proc-key");

        callSendFormDefaults(c);

        expect(postedQuery(c.postMessage, FormDefaultsQuery).defaults).toEqual(defaults);
        expect(postedQuery(c.postMessage, ProcessDefinitionKeyQuery).processDefinitionKey).toBe(
            "proc-key",
        );
    });

    it("posts an empty key when process-key extraction throws", () => {
        const c = createController();
        c.deploymentService.getFormDefaults.mockReturnValue({
            deploymentName: "",
            tenantId: "",
            endpoint: "",
            engine: "c7" as const,
            authType: "none" as const,
        });
        c.startInstanceService.getProcessDefinitionKey.mockImplementation(() => {
            throw new Error("no process id");
        });

        callSendFormDefaults(c);

        expect(postedQuery(c.postMessage, ProcessDefinitionKeyQuery).processDefinitionKey).toBe("");
    });

    it("falls back to empty defaults when there is no active editor", () => {
        const c = createController();
        // The outer try wraps the active-editor lookup, so a throw here drives the
        // empty-defaults fallback path.
        c.editorStore.getActiveEditorId.mockImplementation(() => {
            throw new Error("no active editor");
        });

        callSendFormDefaults(c);

        const defaults = postedQuery(c.postMessage, FormDefaultsQuery).defaults;
        expect(defaults.deploymentName).toBe("");
        expect(defaults.engine).toBe("c7");
        expect(defaults.authType).toBe("none");
        expect(defaults.endpoint).toBe("http://localhost:8080/engine-rest");
        expect(postedQuery(c.postMessage, ProcessDefinitionKeyQuery).processDefinitionKey).toBe("");
    });
});

describe("DeploymentController.subscribeToMessages routing", () => {
    /** Registers the listener and returns the dispatch callback wired by `subscribeToMessages`. */
    function wire(c: ReturnType<typeof createController>): (m: Command) => Promise<void> {
        (
            c.controller as never as { subscribeToMessages: (w: unknown) => void }
        ).subscribeToMessages(c.webviewView);
        return c.onDidReceiveMessage.mock.calls[0][0];
    }

    it("routes RequestFormDefaultsCommand to sendFormDefaults", async () => {
        const c = createController();
        c.deploymentService.getFormDefaults.mockReturnValue({
            deploymentName: "",
            tenantId: "",
            endpoint: "",
            engine: "c7" as const,
            authType: "none" as const,
        });
        c.startInstanceService.getProcessDefinitionKey.mockReturnValue("");

        await wire(c)({ type: "RequestFormDefaultsCommand" } as Command);

        expect(c.deploymentService.getFormDefaults).toHaveBeenCalledOnce();
    });

    it("routes RequestStoredCredentialsCommand to the credentials handler", async () => {
        const c = createController();
        c.deploymentService.getStoredCredentials.mockResolvedValue({ authType: "none" });

        await wire(c)({ type: "RequestStoredCredentialsCommand" } as Command);

        expect(c.deploymentService.getStoredCredentials).toHaveBeenCalledOnce();
        expect(postedQuery(c.postMessage, StoredCredentialsQuery).auth).toEqual({
            authType: "none",
        });
    });

    it("routes RequestAdditionalFilesCommand to the file picker", async () => {
        const c = createController();
        c.deploymentService.selectAdditionalFiles.mockResolvedValue(["/work/a.form"]);

        await wire(c)({ type: "RequestAdditionalFilesCommand" } as Command);

        expect(postedQuery(c.postMessage, AdditionalFilesQuery).filePaths).toEqual([
            "/work/a.form",
        ]);
    });

    it("routes DeployCommand to handleDeploy", async () => {
        const c = createController();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await wire(c)({
            type: "DeployCommand",
            config: deployPayload({ authType: "none" }),
        } as DeployCommand);

        expect(c.deploymentService.deploy).toHaveBeenCalledOnce();
    });

    it("routes RequestProcessDefinitionKeyCommand to the key handler", async () => {
        const c = createController();
        c.startInstanceService.getProcessDefinitionKey.mockReturnValue("proc-key");

        await wire(c)({ type: "RequestProcessDefinitionKeyCommand" } as Command);

        expect(postedQuery(c.postMessage, ProcessDefinitionKeyQuery).processDefinitionKey).toBe(
            "proc-key",
        );
    });

    it("routes RequestPayloadFilesCommand to the payload selector", async () => {
        const c = createController();
        c.startInstanceService.selectPayloadFile.mockResolvedValue({
            filePath: "/work/p.json",
            label: "p.json",
        });

        await wire(c)({ type: "RequestPayloadFilesCommand" } as Command);

        const query = postedQuery(c.postMessage, SelectedPayloadFileQuery);
        expect(query.filePath).toBe("/work/p.json");
        expect(query.label).toBe("p.json");
    });

    it("routes StartInstanceCommand to handleStartInstance", async () => {
        const c = createController();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await wire(c)({
            type: "StartInstanceCommand",
            config: startPayload({ authType: "none" }),
        } as StartInstanceCommand);

        expect(c.startInstanceService.startInstance).toHaveBeenCalledOnce();
    });
});
