import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { DeploymentMessageDispatcher } from "./DeploymentMessageDispatcher";

/**
 * Assembles the dispatcher with structural port doubles. Each collaborator is a
 * bare `vi.fn()` record cast to its interface — the dispatcher only calls these
 * methods, so structural doubles keep the test free of any host surface. The
 * injected `post` is a spy that captures every query the dispatcher sends back.
 */
function createDispatcher() {
    const editorStore = {
        getActiveEditorId: vi.fn().mockReturnValue("editor-1"),
    };
    // Deliberately distinct from the payload's `mainFilePath` so a regression
    // that trusts the webview payload instead of the document path is caught.
    const documentPort = {
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
        logDebug: vi.fn(),
        logInfo: vi.fn(),
        logError: vi.fn(),
    };

    const post = vi.fn();

    const dispatcher = new DeploymentMessageDispatcher(
        editorStore as never,
        documentPort as never,
        deploymentService as never,
        startInstanceService as never,
        notifier as never,
        post,
    );

    return {
        dispatcher,
        editorStore,
        documentPort,
        deploymentService,
        startInstanceService,
        notifier,
        post,
    };
}

/** Finds the single posted message of a given query class among all post calls. */
function postedQuery<T>(post: ReturnType<typeof vi.fn>, type: new (...a: never[]) => T): T {
    const match = post.mock.calls.map((c) => c[0]).find((q) => q instanceof type);
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

const deploy = (c: ReturnType<typeof createDispatcher>, auth: AuthConfigPayload) =>
    c.dispatcher.handle({ type: "DeployCommand", config: deployPayload(auth) } as DeployCommand);

const startInstance = (c: ReturnType<typeof createDispatcher>, auth: AuthConfigPayload) =>
    c.dispatcher.handle({
        type: "StartInstanceCommand",
        config: startPayload(auth),
    } as StartInstanceCommand);

beforeEach(() => {
    vi.clearAllMocks();
});

describe("DeploymentMessageDispatcher deploy auth construction", () => {
    it("builds a BasicAuth from a basic payload", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deploy(c, { authType: "basic", username: "admin", password: "secret" });

        const config = c.deploymentService.deploy.mock.calls[0][0];
        expect(config.auth).toBeInstanceOf(BasicAuth);
        expect(config.auth.username).toBe("admin");
        expect(config.auth.password).toBe("secret");
    });

    it("builds an OAuth2Auth from an oauth2 payload", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deploy(c, {
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
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deploy(c, { authType: "none" });

        expect(c.deploymentService.deploy.mock.calls[0][0].auth).toBeInstanceOf(NoAuth);
    });

    it("deploys the trusted document path, never the webview payload's mainFilePath", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deploy(c, { authType: "none" });

        const config = c.deploymentService.deploy.mock.calls[0][0];
        expect(c.documentPort.getFilePath).toHaveBeenCalledWith("editor-1");
        expect(config.mainFilePath).toBe("/work/trusted/order-process.bpmn");
        expect(config.mainFilePath).not.toBe("/work/order-process.bpmn");
    });
});

describe("DeploymentMessageDispatcher deploy result handling", () => {
    it("shows an info notification and posts a success result", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(
            new DeploymentResult(true, "deployed", "dep-1"),
        );

        await deploy(c, { authType: "none" });

        expect(c.notifier.showInfo).toHaveBeenCalledWith("deployed");
        expect(c.notifier.showError).not.toHaveBeenCalled();
        const query = postedQuery(c.post, DeploymentResultQuery);
        expect(query.success).toBe(true);
        expect(query.message).toBe("deployed");
        expect(query.deploymentId).toBe("dep-1");
    });

    it("shows an error notification and posts a failure result", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(false, "rejected"));

        await deploy(c, { authType: "none" });

        expect(c.notifier.showError).toHaveBeenCalledWith("rejected");
        expect(c.notifier.showInfo).not.toHaveBeenCalled();
        const query = postedQuery(c.post, DeploymentResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe("rejected");
    });

    it("maps an InvalidDeploymentConfigError to its own message", async () => {
        const c = createDispatcher();
        const error = new InvalidDeploymentConfigError(["endpoint"]);
        c.deploymentService.deploy.mockRejectedValue(error);

        await deploy(c, { authType: "none" });

        expect(c.notifier.showError).toHaveBeenCalledWith(error.message);
        expect(postedQuery(c.post, DeploymentResultQuery).message).toBe(error.message);
    });

    it("maps any other thrown error to the generic deployment fallback", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockRejectedValue(new Error("network down"));

        await deploy(c, { authType: "none" });

        const fallback = "An unexpected error occurred during deployment.";
        expect(c.notifier.showError).toHaveBeenCalledWith(fallback);
        const query = postedQuery(c.post, DeploymentResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe(fallback);
    });
});

describe("DeploymentMessageDispatcher start-instance auth construction", () => {
    it("builds a BasicAuth from a basic payload", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await startInstance(c, { authType: "basic", username: "admin", password: "secret" });

        const auth = c.startInstanceService.startInstance.mock.calls[0][3];
        expect(auth).toBeInstanceOf(BasicAuth);
        expect(auth.username).toBe("admin");
    });

    it("builds an OAuth2Auth from an oauth2 payload", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await startInstance(c, {
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
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await startInstance(c, { authType: "none" });

        expect(c.startInstanceService.startInstance.mock.calls[0][3]).toBeInstanceOf(NoAuth);
    });
});

describe("DeploymentMessageDispatcher start-instance result handling", () => {
    it("shows an info notification and posts a success result", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(
            new StartInstanceResult(true, "started", "pi-1"),
        );

        await startInstance(c, { authType: "none" });

        expect(c.notifier.showInfo).toHaveBeenCalledWith("started");
        const query = postedQuery(c.post, StartInstanceResultQuery);
        expect(query.success).toBe(true);
        expect(query.processInstanceId).toBe("pi-1");
    });

    it("shows an error notification and posts a failure result", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(
            new StartInstanceResult(false, "no instance"),
        );

        await startInstance(c, { authType: "none" });

        expect(c.notifier.showError).toHaveBeenCalledWith("no instance");
        expect(postedQuery(c.post, StartInstanceResultQuery).success).toBe(false);
    });

    it("maps a thrown error to the generic start-instance fallback", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockRejectedValue(new Error("boom"));

        await startInstance(c, { authType: "none" });

        const fallback = "An unexpected error occurred while starting the process instance.";
        expect(c.notifier.showError).toHaveBeenCalledWith(fallback);
        const query = postedQuery(c.post, StartInstanceResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe(fallback);
    });
});

describe("DeploymentMessageDispatcher.sendFormDefaults", () => {
    it("posts the service defaults and the process key for the active editor", () => {
        const c = createDispatcher();
        const defaults = {
            deploymentName: "order-process",
            tenantId: "",
            endpoint: "https://c/api",
            engine: "c8" as const,
            authType: "none" as const,
        };
        c.deploymentService.getFormDefaults.mockReturnValue(defaults);
        c.startInstanceService.getProcessDefinitionKey.mockReturnValue("proc-key");

        c.dispatcher.sendFormDefaults();

        expect(postedQuery(c.post, FormDefaultsQuery).defaults).toEqual(defaults);
        expect(postedQuery(c.post, ProcessDefinitionKeyQuery).processDefinitionKey).toBe(
            "proc-key",
        );
    });

    it("posts an empty key when process-key extraction throws", () => {
        const c = createDispatcher();
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

        c.dispatcher.sendFormDefaults();

        expect(postedQuery(c.post, ProcessDefinitionKeyQuery).processDefinitionKey).toBe("");
    });

    it("falls back to empty defaults when there is no active editor", () => {
        const c = createDispatcher();
        c.editorStore.getActiveEditorId.mockImplementation(() => {
            throw new Error("no active editor");
        });

        c.dispatcher.sendFormDefaults();

        const defaults = postedQuery(c.post, FormDefaultsQuery).defaults;
        expect(defaults.deploymentName).toBe("");
        expect(defaults.engine).toBe("c7");
        expect(defaults.authType).toBe("none");
        expect(defaults.endpoint).toBe("http://localhost:8080/engine-rest");
        expect(postedQuery(c.post, ProcessDefinitionKeyQuery).processDefinitionKey).toBe("");
    });
});

describe("DeploymentMessageDispatcher.handle routing", () => {
    it("routes RequestFormDefaultsCommand to sendFormDefaults", async () => {
        const c = createDispatcher();
        c.deploymentService.getFormDefaults.mockReturnValue({
            deploymentName: "",
            tenantId: "",
            endpoint: "",
            engine: "c7" as const,
            authType: "none" as const,
        });
        c.startInstanceService.getProcessDefinitionKey.mockReturnValue("");

        await c.dispatcher.handle({ type: "RequestFormDefaultsCommand" } as Command);

        expect(c.deploymentService.getFormDefaults).toHaveBeenCalledOnce();
    });

    it("routes RequestStoredCredentialsCommand to the credentials handler", async () => {
        const c = createDispatcher();
        c.deploymentService.getStoredCredentials.mockResolvedValue({ authType: "none" });

        await c.dispatcher.handle({ type: "RequestStoredCredentialsCommand" } as Command);

        expect(c.deploymentService.getStoredCredentials).toHaveBeenCalledOnce();
        expect(postedQuery(c.post, StoredCredentialsQuery).auth).toEqual({ authType: "none" });
    });

    it("posts empty stored credentials when the lookup throws", async () => {
        const c = createDispatcher();
        c.deploymentService.getStoredCredentials.mockRejectedValue(new Error("locked"));

        await c.dispatcher.handle({ type: "RequestStoredCredentialsCommand" } as Command);

        expect(postedQuery(c.post, StoredCredentialsQuery).auth).toEqual({ authType: "none" });
    });

    it("routes RequestAdditionalFilesCommand to the file picker", async () => {
        const c = createDispatcher();
        c.deploymentService.selectAdditionalFiles.mockResolvedValue(["/work/a.form"]);

        await c.dispatcher.handle({ type: "RequestAdditionalFilesCommand" } as Command);

        expect(postedQuery(c.post, AdditionalFilesQuery).filePaths).toEqual(["/work/a.form"]);
    });

    it("posts an empty additional-files list when the picker throws", async () => {
        const c = createDispatcher();
        c.deploymentService.selectAdditionalFiles.mockRejectedValue(new Error("denied"));

        await c.dispatcher.handle({ type: "RequestAdditionalFilesCommand" } as Command);

        expect(postedQuery(c.post, AdditionalFilesQuery).filePaths).toEqual([]);
    });

    it("routes DeployCommand to the deploy handler", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await c.dispatcher.handle({
            type: "DeployCommand",
            config: deployPayload({ authType: "none" }),
        } as DeployCommand);

        expect(c.deploymentService.deploy).toHaveBeenCalledOnce();
    });

    it("routes RequestProcessDefinitionKeyCommand to the key handler", async () => {
        const c = createDispatcher();
        c.startInstanceService.getProcessDefinitionKey.mockReturnValue("proc-key");

        await c.dispatcher.handle({ type: "RequestProcessDefinitionKeyCommand" } as Command);

        expect(postedQuery(c.post, ProcessDefinitionKeyQuery).processDefinitionKey).toBe(
            "proc-key",
        );
    });

    it("posts an empty key when key extraction throws", async () => {
        const c = createDispatcher();
        c.startInstanceService.getProcessDefinitionKey.mockImplementation(() => {
            throw new Error("no id");
        });

        await c.dispatcher.handle({ type: "RequestProcessDefinitionKeyCommand" } as Command);

        expect(postedQuery(c.post, ProcessDefinitionKeyQuery).processDefinitionKey).toBe("");
    });

    it("routes RequestPayloadFilesCommand to the payload selector", async () => {
        const c = createDispatcher();
        c.startInstanceService.selectPayloadFile.mockResolvedValue({
            filePath: "/work/p.json",
            label: "p.json",
        });

        await c.dispatcher.handle({ type: "RequestPayloadFilesCommand" } as Command);

        const query = postedQuery(c.post, SelectedPayloadFileQuery);
        expect(query.filePath).toBe("/work/p.json");
        expect(query.label).toBe("p.json");
    });

    it("posts an empty payload file when none is selected", async () => {
        const c = createDispatcher();
        c.startInstanceService.selectPayloadFile.mockResolvedValue(null);

        await c.dispatcher.handle({ type: "RequestPayloadFilesCommand" } as Command);

        const query = postedQuery(c.post, SelectedPayloadFileQuery);
        expect(query.filePath).toBe("");
        expect(query.label).toBe("");
    });

    it("routes StartInstanceCommand to the start-instance handler", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await c.dispatcher.handle({
            type: "StartInstanceCommand",
            config: startPayload({ authType: "none" }),
        } as StartInstanceCommand);

        expect(c.startInstanceService.startInstance).toHaveBeenCalledOnce();
    });
});
