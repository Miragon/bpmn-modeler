import { describe, expect, it, vi } from "vitest";

import {
    AdditionalFilesQuery,
    CreateTargetCommand,
    DeleteTargetCommand,
    DeploymentResultQuery,
    DeploymentTargetsQuery,
    FormDefaultsQuery,
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    ProcessDefinitionKeyQuery,
    SaveTargetCommand,
    SelectedPayloadFileQuery,
    SelectTargetCommand,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
    TargetSavedQuery,
    type AuthConfigPayload,
    type Command,
    type DeployCommand,
    type DeploymentTargetPayload,
    type StartInstanceCommand,
} from "@miragon/bpmn-modeler-shared";

import { CredentialRefs } from "../domain/credentialRefs";
import {
    AdHocDestination,
    NamedDestination,
    namesTarget,
    resolveNamedDestination,
    TargetEdit,
    TargetsLocation,
} from "../domain/deploymentDestination";
import { DeploymentTarget, DeploymentTargets } from "../domain/deploymentTarget";
import {
    type AuthConfig,
    BasicAuth,
    DeploymentResult,
    NoAuth,
    OAuth2Auth,
} from "../domain/deployment";
import { StartInstanceResult } from "../domain/startInstance";
import { InvalidDeploymentConfigError } from "../domain/errors";
import { UserCancelledError } from "../../kernel/domain/errors";
import { createTestHost } from "../../testing";
import { DeploymentMessageDispatcher } from "./DeploymentMessageDispatcher";
import { SaveBeforeDeploy } from "./SaveBeforeDeploy";

// Deliberately distinct from the payload's `mainFilePath` so a regression
// that trusts the webview payload instead of the document path is caught.
const TRUSTED_PATH = "/work/trusted/order-process.bpmn";

const LOCATION: TargetsLocation = { filePath: "/ws/targets.json", exists: true, projectDir: "/ws" };
const AD_HOC = new AdHocDestination("http://localhost:8080/engine-rest", "");

const localTarget = (name: string) =>
    new DeploymentTarget(name, "c7", "http://localhost:8080/engine-rest", "", "none", "", "");

const named = (target: DeploymentTarget) => new NamedDestination(target, LOCATION);

function createDispatcher({ openDiagram = true } = {}) {
    const host = createTestHost();
    if (openDiagram) host.openEditor(TRUSTED_PATH);
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
    const deploymentTargetService = {
        listTargets: vi.fn().mockResolvedValue([]),
        getActiveTarget: vi.fn().mockResolvedValue(undefined),
        resolveDestination: resolvingAgainst([]),
        setActiveTarget: vi.fn().mockResolvedValue(undefined),
        createTarget: vi
            .fn()
            .mockResolvedValue(
                new TargetEdit(new DeploymentTargets([]).add(localTarget("dev")), LOCATION),
            ),
        saveTarget: vi
            .fn()
            .mockResolvedValue(
                new TargetEdit(
                    new DeploymentTargets([localTarget("dev")]).upsert(localTarget("dev")),
                    LOCATION,
                ),
            ),
        deleteTarget: vi
            .fn()
            .mockResolvedValue(
                new TargetEdit(new DeploymentTargets([localTarget("dev")]).remove("dev"), LOCATION),
            ),
        getStoredCredentials: vi.fn().mockResolvedValue({ authType: "none" }),
        openTargetsFile: vi.fn().mockResolvedValue(undefined),
    };
    const post = vi.fn();

    const dispatcher = new DeploymentMessageDispatcher(
        host.store,
        host.documents,
        deploymentService as never,
        startInstanceService as never,
        deploymentTargetService as never,
        new SaveBeforeDeploy(host.documents, {
            flushIntoDocument: async () => ({ status: "safe", session: {} }),
        }),
        host.notifier,
        post,
    );

    return {
        dispatcher,
        host,
        deploymentService,
        startInstanceService,
        deploymentTargetService,
        post,
    };
}

/** Resolves a request's target name against a targets file at {@link LOCATION} holding `saved`. */
function resolvingAgainst(saved: DeploymentTarget[]) {
    return vi.fn(async (targetName: string | undefined, adHoc: AdHocDestination) =>
        namesTarget(targetName)
            ? resolveNamedDestination(targetName, LOCATION, new DeploymentTargets(saved))
            : adHoc,
    );
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
    targetName: "",
});

const startPayload = (auth: AuthConfigPayload): StartInstanceCommand["config"] => ({
    processDefinitionKey: "order-process",
    endpoint: "http://localhost:8080/engine-rest",
    engine: "c7",
    auth,
    payloadFilePath: "",
    targetName: "",
});

const deploy = (c: ReturnType<typeof createDispatcher>, auth: AuthConfigPayload) =>
    c.dispatcher.handle({ type: "DeployCommand", config: deployPayload(auth) } as DeployCommand);

const startInstance = (c: ReturnType<typeof createDispatcher>, auth: AuthConfigPayload) =>
    c.dispatcher.handle({
        type: "StartInstanceCommand",
        config: startPayload(auth),
    } as StartInstanceCommand);

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
        expect(config.mainFilePath).toBe(TRUSTED_PATH);
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

        expect(c.host.notifier.infos).toEqual(["deployed"]);
        expect(c.host.notifier.errors).toEqual([]);
        const query = postedQuery(c.post, DeploymentResultQuery);
        expect(query.success).toBe(true);
        expect(query.message).toBe("deployed");
        expect(query.deploymentId).toBe("dep-1");
    });

    it("shows an error notification and posts a failure result", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(false, "rejected"));

        await deploy(c, { authType: "none" });

        expect(c.host.notifier.errors).toEqual(["rejected"]);
        expect(c.host.notifier.infos).toEqual([]);
        const query = postedQuery(c.post, DeploymentResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe("rejected");
    });

    it("maps an InvalidDeploymentConfigError to its own message", async () => {
        const c = createDispatcher();
        const error = new InvalidDeploymentConfigError(["endpoint"]);
        c.deploymentService.deploy.mockRejectedValue(error);

        await deploy(c, { authType: "none" });

        expect(c.host.notifier.errors).toEqual([error.message]);
        expect(postedQuery(c.post, DeploymentResultQuery).message).toBe(error.message);
    });

    it("maps any other thrown error to the generic deployment fallback", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockRejectedValue(new Error("network down"));

        await deploy(c, { authType: "none" });

        const fallback = "An unexpected error occurred during deployment.";
        expect(c.host.notifier.errors).toEqual([fallback]);
        const query = postedQuery(c.post, DeploymentResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe(fallback);
    });

    it("posts a cancelled result without a notification or an error log when the user cancels a prompt", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockRejectedValue(new UserCancelledError());

        await deploy(c, { authType: "none" });

        expect(c.host.notifier.errors).toEqual([]);
        expect(c.host.notifier.logged("error")).toEqual([]);
        expect(postedQuery(c.post, DeploymentResultQuery)).toMatchObject({
            success: false,
            cancelled: true,
        });
    });
});

describe("DeploymentMessageDispatcher deploy saves the diagram first", () => {
    const savedTarget = new DeploymentTarget(
        "dev",
        "c7",
        "http://localhost:8080/engine-rest",
        "",
        "none",
        "",
        "",
    );

    const createWithDiagram = () => {
        const c = createDispatcher({ openDiagram: false });
        return { ...c, editor: c.host.openEditor(TRUSTED_PATH) };
    };

    it("saves the diagram before the deploy reads it from disk", async () => {
        const c = createWithDiagram();
        let savesBeforeDeploy: number | undefined;
        c.deploymentService.deploy.mockImplementation(async () => {
            savesBeforeDeploy = c.editor.saveCount;
            return new DeploymentResult(true, "ok");
        });

        await deploy(c, { authType: "none" });

        expect(savesBeforeDeploy).toBe(1);
    });

    it("deploys nothing and posts a failure result when the save throws", async () => {
        const c = createWithDiagram();
        vi.spyOn(c.editor, "save").mockRejectedValue(new Error("read-only file system"));

        await deploy(c, { authType: "none" });

        const message = "Could not save the diagram before deploying: read-only file system";
        expect(c.deploymentService.deploy).not.toHaveBeenCalled();
        expect(c.host.notifier.errors).toEqual([message]);
        const query = postedQuery(c.post, DeploymentResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe(message);
    });

    it.each([
        { reason: "an invalid config", payload: { deploymentName: " " }, target: savedTarget },
        { reason: "a missing target", payload: { targetName: "dev" }, target: undefined },
        {
            reason: "a changed target",
            payload: { targetName: "dev", endpoint: "https://different" },
            target: savedTarget,
        },
    ])("saves nothing for a request rejected for $reason", async ({ payload, target }) => {
        const c = createWithDiagram();
        c.deploymentTargetService.resolveDestination = resolvingAgainst(target ? [target] : []);

        await c.dispatcher.handle({
            type: "DeployCommand",
            config: { ...deployPayload({ authType: "none" }), ...payload },
        } as DeployCommand);

        expect(c.editor.saveCount).toBe(0);
        expect(postedQuery(c.post, DeploymentResultQuery).success).toBe(false);
    });
});

describe("DeploymentMessageDispatcher deploy breadcrumbs", () => {
    function allLoggedText(c: ReturnType<typeof createDispatcher>): string {
        return c.host.notifier.logs.map((entry) => entry.message).join("\n");
    }

    it("leaves the start breadcrumbs to the services, which log the resolved host", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await deploy(c, { authType: "none" });
        await startInstance(c, { authType: "none" });

        expect(allLoggedText(c)).not.toContain("Deployment started");
        expect(allLoggedText(c)).not.toContain("Instance start requested");
    });

    it("logs a warning breadcrumb when the deployment fails", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(false, "rejected"));

        await deploy(c, { authType: "none" });

        expect(c.host.notifier.logged("warning")).toEqual(["Deployment failed: rejected"]);
    });

    it("never writes the basic-auth password to any log line", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deploy(c, { authType: "basic", username: "admin", password: "s3cret" });

        expect(allLoggedText(c)).not.toContain("s3cret");
    });

    it("never writes an oauth2 client secret to any log line", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await startInstance(c, {
            authType: "oauth2",
            clientId: "cid",
            clientSecret: "s3cret",
            tokenEndpoint: "https://idp/token",
            audience: "zeebe-api",
        });

        expect(allLoggedText(c)).not.toContain("s3cret");
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

    it("threads the active document directory so env refs resolve against its .env", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));

        await startInstance(c, { authType: "none" });

        expect(c.startInstanceService.startInstance.mock.calls[0][6]).toBe("/work/trusted");
    });

    const savedTarget = new DeploymentTarget(
        "dev",
        "c7",
        "http://localhost:8080/engine-rest",
        "",
        "none",
        "",
        "",
    );

    it.each([
        { mode: "a named target", targetName: "dev", destination: named(savedTarget) },
        { mode: "an ad-hoc request", targetName: "", destination: AD_HOC },
    ])("passes the validated destination for $mode", async ({ targetName, destination }) => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));
        c.deploymentTargetService.resolveDestination = resolvingAgainst([savedTarget]);

        await c.dispatcher.handle({
            type: "StartInstanceCommand",
            config: { ...startPayload({ authType: "none" }), targetName },
        } as StartInstanceCommand);

        expect(c.startInstanceService.startInstance).toHaveBeenCalledExactlyOnceWith(
            "order-process",
            "http://localhost:8080/engine-rest",
            "c7",
            new NoAuth(),
            "",
            undefined,
            "/work/trusted",
            destination,
        );
        expect(postedQuery(c.post, StartInstanceResultQuery).success).toBe(true);
    });
});

describe("DeploymentMessageDispatcher start-instance result handling", () => {
    it("shows an info notification and posts a success result", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockResolvedValue(
            new StartInstanceResult(true, "started", "pi-1"),
        );

        await startInstance(c, { authType: "none" });

        expect(c.host.notifier.infos).toEqual(["started"]);
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

        expect(c.host.notifier.errors).toEqual(["no instance"]);
        expect(postedQuery(c.post, StartInstanceResultQuery).success).toBe(false);
    });

    it("maps a thrown error to the generic start-instance fallback", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockRejectedValue(new Error("boom"));

        await startInstance(c, { authType: "none" });

        const fallback = "An unexpected error occurred while starting the process instance.";
        expect(c.host.notifier.errors).toEqual([fallback]);
        const query = postedQuery(c.post, StartInstanceResultQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe(fallback);
    });

    it("posts a cancelled result without a notification or an error log when the user cancels a prompt", async () => {
        const c = createDispatcher();
        c.startInstanceService.startInstance.mockRejectedValue(new UserCancelledError());

        await startInstance(c, { authType: "none" });

        expect(c.host.notifier.errors).toEqual([]);
        expect(c.host.notifier.logged("error")).toEqual([]);
        expect(postedQuery(c.post, StartInstanceResultQuery)).toMatchObject({
            success: false,
            cancelled: true,
        });
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
        // A parseable diagram whose key can't be read is a degradation → warn.
        expect(c.host.notifier.logged("warning")).toEqual([
            expect.stringContaining("Process-definition key extraction failed"),
        ]);
    });

    it("falls back to empty defaults (and only debug-logs) when there is no active editor", () => {
        const c = createDispatcher({ openDiagram: false });

        c.dispatcher.sendFormDefaults();

        // No active editor is the expected steady state — debug, not warn.
        expect(c.host.notifier.logged("debug")).toContainEqual(
            expect.stringContaining("No active editor for deployment form defaults"),
        );
        expect(c.host.notifier.logged("warning")).toEqual([]);
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

describe("DeploymentMessageDispatcher target commands", () => {
    it("echoes credential request identity on success and failure", async () => {
        const c = createDispatcher();
        await c.dispatcher.handle({
            type: "RequestStoredCredentialsCommand",
            targetName: "dev",
            requestId: 42,
        } as Command);
        expect(postedQuery(c.post, StoredCredentialsQuery)).toMatchObject({
            targetName: "dev",
            requestId: 42,
        });
        c.post.mockClear();
        c.deploymentTargetService.getStoredCredentials.mockRejectedValue(new Error("locked"));
        await c.dispatcher.handle({
            type: "RequestStoredCredentialsCommand",
            targetName: "dev",
            requestId: 43,
        } as Command);
        expect(postedQuery(c.post, StoredCredentialsQuery)).toMatchObject({
            targetName: "dev",
            requestId: 43,
            auth: { authType: "none" },
        });
    });

    it.each([
        undefined,
        new DeploymentTarget("dev", "c7", "https://different", "", "none", "", ""),
    ])("rejects a missing or changed target before deploying or starting: %j", async (target) => {
        const c = createDispatcher();
        c.deploymentTargetService.resolveDestination = resolvingAgainst(target ? [target] : []);
        await c.dispatcher.handle({
            type: "DeployCommand",
            config: { ...deployPayload({ authType: "none" }), targetName: "dev" },
        } as DeployCommand);
        await c.dispatcher.handle({
            type: "StartInstanceCommand",
            config: { ...startPayload({ authType: "none" }), targetName: "dev" },
        } as StartInstanceCommand);
        expect(c.deploymentService.deploy).not.toHaveBeenCalled();
        expect(c.startInstanceService.startInstance).not.toHaveBeenCalled();
        expect(postedQuery(c.post, DeploymentResultQuery).success).toBe(false);
        expect(postedQuery(c.post, StartInstanceResultQuery).success).toBe(false);
    });

    it("deploys against the submitted target and captures the document context before asynchronous lookup", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(
            new DeploymentTarget("other", "c7", "https://other", "", "none", "", ""),
        );
        const submittedTarget = new DeploymentTarget(
            "dev",
            "c7",
            "http://localhost:8080/engine-rest",
            "",
            "none",
            "",
            "",
        );
        c.deploymentTargetService.resolveDestination.mockImplementation(async () => {
            c.host.openEditor("/another/diagram.bpmn", "", { focused: true });
            return named(submittedTarget);
        });
        await c.dispatcher.handle({
            type: "DeployCommand",
            config: { ...deployPayload({ authType: "none" }), targetName: "dev" },
        } as DeployCommand);
        expect(c.deploymentTargetService.resolveDestination).toHaveBeenCalledWith(
            "dev",
            AD_HOC,
            "/work/trusted",
        );
        const [config, destination] = c.deploymentService.deploy.mock.calls[0];
        expect(config.mainFilePath).toBe(TRUSTED_PATH);
        expect(destination).toEqual(named(submittedTarget));
    });

    it("deploys over the ad-hoc connection the request names", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await c.dispatcher.handle({
            type: "DeployCommand",
            config: {
                ...deployPayload({ authType: "none" }),
                endpoint: "https://typed.example/engine-rest",
                tenantId: "acme",
            },
        } as DeployCommand);

        expect(c.deploymentService.deploy).toHaveBeenCalledWith(
            expect.anything(),
            new AdHocDestination("https://typed.example/engine-rest", "acme"),
        );
    });

    const targetPayload: DeploymentTargetPayload = {
        name: "dev",
        engine: "c7",
        endpoint: "http://localhost:8080/engine-rest",
        tenantId: "",
        authType: "none",
    };

    it("scopes the stored-credentials lookup to a named target", async () => {
        const c = createDispatcher();
        c.deploymentTargetService.getStoredCredentials.mockResolvedValue({
            authType: "basic",
            username: "u",
            password: "p",
        });

        await c.dispatcher.handle({
            type: "RequestStoredCredentialsCommand",
            targetName: "dev",
        } as Command);

        expect(c.deploymentTargetService.getStoredCredentials).toHaveBeenCalledWith(
            "dev",
            expect.anything(),
        );
        expect(c.deploymentService.getStoredCredentials).not.toHaveBeenCalled();
        expect(postedQuery(c.post, StoredCredentialsQuery).auth.authType).toBe("basic");
    });

    it("persists the active target and re-sends the form defaults on SelectTargetCommand", async () => {
        const c = createDispatcher();
        c.deploymentService.getFormDefaults.mockReturnValue({
            deploymentName: "",
            tenantId: "",
            endpoint: "",
            engine: "c7" as const,
            authType: "none" as const,
        });
        c.startInstanceService.getProcessDefinitionKey.mockReturnValue("");

        await c.dispatcher.handle(new SelectTargetCommand("dev"));

        expect(c.deploymentTargetService.setActiveTarget).toHaveBeenCalledWith("dev");
        expect(postedQuery(c.post, FormDefaultsQuery)).toBeTruthy();
    });

    it("pushes the target list once, after the reply of the last of two overlapping target commands", async () => {
        const c = createDispatcher();
        let finishSelect: () => void = () => undefined;
        c.deploymentTargetService.setActiveTarget.mockImplementation(async () => {
            await c.dispatcher.targetsChanged();
            await new Promise<void>((resolve) => (finishSelect = resolve));
        });
        c.deploymentTargetService.saveTarget.mockImplementation(async () => {
            await c.dispatcher.targetsChanged();
            return new TargetEdit(
                new DeploymentTargets([localTarget("dev")]).upsert(localTarget("dev")),
                LOCATION,
            );
        });
        const targetQueries = () =>
            c.post.mock.calls
                .map(([query]) => query)
                .filter(
                    (query) =>
                        query instanceof TargetSavedQuery ||
                        query instanceof DeploymentTargetsQuery,
                )
                .map((query) => query.type);

        const selecting = c.dispatcher.handle(new SelectTargetCommand("dev"));
        await c.dispatcher.handle(
            new SaveTargetCommand(targetPayload, { authType: "none" }, undefined),
        );
        expect(targetQueries()).toEqual(["TargetSavedQuery"]);
        finishSelect();
        await selecting;

        expect(targetQueries()).toEqual(["TargetSavedQuery", "DeploymentTargetsQuery"]);
    });

    it("opens the targets file for the active document on OpenTargetsFileCommand", async () => {
        const c = createDispatcher();

        await c.dispatcher.handle({ type: "OpenTargetsFileCommand" } as Command);

        expect(c.deploymentTargetService.openTargetsFile).toHaveBeenCalledWith("/work/trusted");
    });

    it("reports a failure to open the targets file via notifyError", async () => {
        const c = createDispatcher();
        c.deploymentTargetService.openTargetsFile.mockRejectedValue(new Error("no workspace"));

        await c.dispatcher.handle({ type: "OpenTargetsFileCommand" } as Command);

        expect(c.host.notifier.errors).toEqual([
            "Could not open deployment targets file\nno workspace",
        ]);
    });

    it("creates a target and posts a success TargetSavedQuery", async () => {
        const c = createDispatcher();

        await c.dispatcher.handle(new CreateTargetCommand(targetPayload, { authType: "none" }));

        expect(c.deploymentTargetService.createTarget).toHaveBeenCalledWith(
            targetPayload,
            { authType: "none" },
            expect.anything(),
        );
        const query = postedQuery(c.post, TargetSavedQuery);
        expect(query.success).toBe(true);
        expect(query.message).toContain(targetPayload.name);
    });

    it("posts a failure TargetSavedQuery when creating throws", async () => {
        const c = createDispatcher();
        c.deploymentTargetService.createTarget.mockRejectedValue(
            new Error('A deployment target named "dev" already exists.'),
        );

        await c.dispatcher.handle(new CreateTargetCommand(targetPayload, { authType: "none" }));

        const query = postedQuery(c.post, TargetSavedQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe('A deployment target named "dev" already exists.');
    });

    it("saves a target and posts a success TargetSavedQuery", async () => {
        const c = createDispatcher();

        await c.dispatcher.handle(
            new SaveTargetCommand(targetPayload, { authType: "none" }, undefined),
        );

        expect(c.deploymentTargetService.saveTarget).toHaveBeenCalledWith(
            targetPayload,
            { authType: "none" },
            undefined,
            expect.anything(),
        );
        expect(postedQuery(c.post, TargetSavedQuery).success).toBe(true);
    });

    it("posts a failure TargetSavedQuery when saving throws", async () => {
        const c = createDispatcher();
        c.deploymentTargetService.saveTarget.mockRejectedValue(new Error("no workspace"));

        await c.dispatcher.handle(
            new SaveTargetCommand(targetPayload, { authType: "none" }, undefined),
        );

        const query = postedQuery(c.post, TargetSavedQuery);
        expect(query.success).toBe(false);
        expect(query.message).toBe("no workspace");
    });

    it("deletes a target and re-sends targets when confirmed", async () => {
        const c = createDispatcher();

        await c.dispatcher.handle(new DeleteTargetCommand("dev"));

        expect(c.deploymentTargetService.deleteTarget).toHaveBeenCalledWith(
            "dev",
            expect.anything(),
        );
        expect(postedQuery(c.post, TargetSavedQuery).success).toBe(true);
    });

    it("does not post when a delete is cancelled", async () => {
        const c = createDispatcher();
        c.deploymentTargetService.deleteTarget.mockResolvedValue(undefined);

        await c.dispatcher.handle(new DeleteTargetCommand("dev"));

        expect(
            c.post.mock.calls.map((call) => call[0]).some((q) => q instanceof TargetSavedQuery),
        ).toBe(false);
    });

    it("deploys against the target at the file it was resolved from", async () => {
        const c = createDispatcher();
        c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
        c.deploymentTargetService.resolveDestination = resolvingAgainst([localTarget("dev")]);

        await c.dispatcher.handle({
            type: "DeployCommand",
            config: { ...deployPayload({ authType: "none" }), targetName: "dev" },
        } as DeployCommand);

        const destination = c.deploymentService.deploy.mock.calls[0][1];
        expect(destination).toEqual(named(localTarget("dev")));
        expect(destination.secretSlot).toBe("/ws/targets.json::dev");
    });
});

type Dispatcher = ReturnType<typeof createDispatcher>;

const PASSWORD_REF = "${env:MIRAGON_PW}";
const TARGET_CHANGED_MESSAGE =
    "The deployment target changed. Save or reload the target before continuing.";
const CREDENTIAL_REFS_CHANGED_MESSAGE =
    "Credential environment references differ from the saved target. Save or reload the target before continuing.";

const basicTargetWith = (credentialRefs: CredentialRefs) =>
    new DeploymentTarget(
        "dev",
        "c7",
        "http://localhost:8080/engine-rest",
        "",
        "basic",
        "",
        "",
        undefined,
        undefined,
        credentialRefs,
    );

const basicAuth = (username: string, password: string): AuthConfigPayload => ({
    authType: "basic",
    username,
    password,
});

interface NamedTargetRequest {
    action: string;
    submit: (
        c: Dispatcher,
        auth: AuthConfigPayload,
        changed?: Record<string, unknown>,
    ) => Promise<void>;
    /** One change per payload setting the dispatcher hands to the admission check. */
    changedSettings: Record<string, unknown>[];
    runner: (c: Dispatcher) => ReturnType<typeof vi.fn>;
    handedAuth: (c: Dispatcher) => AuthConfig;
    result: (c: Dispatcher) => { success: boolean; message: string };
}

const changedConnectionSettings = [
    { endpoint: "https://other/engine-rest" },
    { engine: "c8" },
    { auth: { authType: "none" } },
];

const namedTargetRequests: NamedTargetRequest[] = [
    {
        action: "deploy",
        submit: (c, auth, changed) =>
            c.dispatcher.handle({
                type: "DeployCommand",
                config: { ...deployPayload(auth), targetName: "dev", ...changed },
            } as DeployCommand),
        changedSettings: [
            ...changedConnectionSettings,
            { tenantId: "another" },
            { deployUrl: "https://other/deploy" },
        ],
        runner: (c) => c.deploymentService.deploy,
        handedAuth: (c) => c.deploymentService.deploy.mock.calls[0][0].auth,
        result: (c) => postedQuery(c.post, DeploymentResultQuery),
    },
    {
        action: "start-instance",
        submit: (c, auth, changed) =>
            c.dispatcher.handle({
                type: "StartInstanceCommand",
                config: { ...startPayload(auth), targetName: "dev", ...changed },
            } as StartInstanceCommand),
        changedSettings: [
            ...changedConnectionSettings,
            { startInstanceUrl: "https://other/start" },
        ],
        runner: (c) => c.startInstanceService.startInstance,
        handedAuth: (c) => c.startInstanceService.startInstance.mock.calls[0][3],
        result: (c) => postedQuery(c.post, StartInstanceResultQuery),
    },
];

function createDispatcherAgainst(target: DeploymentTarget): Dispatcher {
    const c = createDispatcher();
    c.deploymentService.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
    c.startInstanceService.startInstance.mockResolvedValue(new StartInstanceResult(true, "ok"));
    c.deploymentTargetService.resolveDestination = resolvingAgainst([target]);
    return c;
}

describe.each(namedTargetRequests)(
    "DeploymentMessageDispatcher $action admission against a named target",
    ({ submit, changedSettings, runner, handedAuth, result }) => {
        it.each(changedSettings)(
            "checks the requested %j against the saved target",
            async (changed) => {
                const c = createDispatcherAgainst(basicTargetWith(CredentialRefs.none()));

                await submit(c, basicAuth("admin", "s3cret"), changed);

                expect(runner(c)).not.toHaveBeenCalled();
                expect(result(c)).toMatchObject({
                    success: false,
                    message: TARGET_CHANGED_MESSAGE,
                });
            },
        );

        it("runs and persists nothing for a refused request, and says why", async () => {
            const c = createDispatcherAgainst(basicTargetWith(CredentialRefs.none()));

            await submit(c, basicAuth("admin", PASSWORD_REF));

            expect(runner(c)).not.toHaveBeenCalled();
            expect(c.deploymentTargetService.saveTarget).not.toHaveBeenCalled();
            expect(c.deploymentTargetService.createTarget).not.toHaveBeenCalled();
            expect(c.host.notifier.errors).toEqual([CREDENTIAL_REFS_CHANGED_MESSAGE]);
            expect(result(c)).toMatchObject({
                success: false,
                message: CREDENTIAL_REFS_CHANGED_MESSAGE,
            });
        });

        it("runs an admitted request with the credentials it carries", async () => {
            const target = basicTargetWith(CredentialRefs.basic(undefined, PASSWORD_REF));
            const c = createDispatcherAgainst(target);

            await submit(c, basicAuth("ops", `  ${PASSWORD_REF} `));

            expect(runner(c)).toHaveBeenCalledOnce();
            expect(result(c).success).toBe(true);
            expect(c.host.notifier.errors).toEqual([]);
            expect(CredentialRefs.of(handedAuth(c))).toEqual(target.credentialRefs);
        });
    },
);

describe("DeploymentMessageDispatcher deploy literal credentials on a named target", () => {
    it("hands literal credentials and the target's destination to the deployment for persisting", async () => {
        const target = basicTargetWith(CredentialRefs.basic(undefined, PASSWORD_REF));
        const c = createDispatcherAgainst(target);

        await c.dispatcher.handle({
            type: "DeployCommand",
            config: { ...deployPayload(basicAuth("ops", PASSWORD_REF)), targetName: "dev" },
        } as DeployCommand);

        const [config, destination] = c.deploymentService.deploy.mock.calls[0];
        expect(config.auth).toBeInstanceOf(BasicAuth);
        expect(config.auth.username).toBe("ops");
        expect(destination).toEqual(named(target));
        expect(destination.secretSlot).toBe("/ws/targets.json::dev");
    });
});

describe("DeploymentMessageDispatcher.handle webview-log routing", () => {
    it("routes each Log* level onto the notifier with a [webview:deployment] tag", async () => {
        const c = createDispatcher();

        await c.dispatcher.handle(new LogDebugCommand("d"));
        await c.dispatcher.handle(new LogInfoCommand("i"));
        await c.dispatcher.handle(new LogWarningCommand("w"));
        await c.dispatcher.handle(new LogErrorCommand("boom", "at foo"));

        expect(c.host.notifier.logged("info")).toContain("[webview:deployment] i");
        expect(c.host.notifier.logged("warning")).toContain("[webview:deployment] w");
        expect(c.host.notifier.logged("error")).toContain("[webview:deployment] boom\nat foo");
    });

    it("does not enter the command switch for a Log* command", async () => {
        const c = createDispatcher();

        await c.dispatcher.handle(new LogInfoCommand("i"));

        // The switch's per-message debug breadcrumb is skipped for log traffic
        // so forwarded lines aren't double-logged.
        expect(c.host.notifier.logged("debug")).not.toContain(
            "Deployment message received -> LogInfoCommand",
        );
        expect(c.deploymentService.getFormDefaults).not.toHaveBeenCalled();
    });

    it("still no-ops on an unknown, non-log command type", async () => {
        const c = createDispatcher();

        await c.dispatcher.handle({ type: "TotallyUnknownCommand" } as Command);

        expect(c.post).not.toHaveBeenCalled();
        expect(c.host.notifier.logged("debug")).toContain(
            "Deployment message received -> TotallyUnknownCommand",
        );
    });
});
