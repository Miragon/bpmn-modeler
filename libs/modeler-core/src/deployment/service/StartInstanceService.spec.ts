import { afterEach, describe, expect, it, vi } from "vitest";

import { BasicAuth, NoAuth } from "../domain/deployment";
import {
    AdHocDestination,
    DeploymentDestination,
    NamedDestination,
} from "../domain/deploymentDestination";
import { payloadFilePrompt } from "../domain/deploymentPrompts";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { ENV_VARIABLE_PREFIX } from "../domain/envRef";
import { StartInstanceConfig, StartInstanceResult } from "../domain/startInstance";
import { CamundaEnginePort } from "../domain/ports";
import { FetchHttpClient } from "../../kernel/infrastructure/FetchHttpClient";
import { AuthHeaderResolver } from "../infrastructure/camunda/AuthHeaderResolver";
import { Camunda7RestClient } from "../infrastructure/camunda/Camunda7RestClient";
import { CredentialApprovalService } from "./CredentialApprovalService";
import { EnvValueResolver } from "./EnvValueResolver";
import { StartInstanceService } from "./StartInstanceService";
import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import {
    CredentialDestinationNotApprovedError,
    DisallowedEnvReferenceError,
    InvalidDeploymentConfigError,
    UnresolvedEnvVariableError,
} from "../domain/errors";
import { HttpTransportError } from "../../kernel/domain/http";
import { createTestHost, TestHostOptions } from "../../testing";

// A real C7 document so `getProcessDefinitionKey` exercises the production
// `BpmnDocument.extractProcessId` against valid XML rather than a stub.
const C7_DOC = BpmnDocument.empty("c7", "7.24.0");

const PROJECT_DIR = "/work";
const DEV_SLOT = "/work/.camunda/deployment-targets.json::dev";

const NAMED_TARGET = new DeploymentTarget("dev", "c7", "${env:MIRAGON_URL}", "", "none", "", "");
/** A start records no ledger row, so the ad-hoc connection's endpoint is never read. */
const AD_HOC = new AdHocDestination("http://localhost:8080/engine-rest", "");

function named(target: DeploymentTarget, projectDir = PROJECT_DIR): NamedDestination {
    return new NamedDestination(target, {
        filePath: `${projectDir}/.camunda/deployment-targets.json`,
        exists: true,
        projectDir,
    });
}

function dotEnvContent(variables: Record<string, string>): string {
    return Object.entries(variables)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
}

interface ServiceOptions extends TestHostOptions {
    /** Variables of the workspace folder's `/work/.env`. */
    dotEnv?: Record<string, string>;
    /** Replaces the REST client mock, e.g. with the real stack over a stubbed `fetch`. */
    engineClient?: CamundaEnginePort;
}

/**
 * Workspace folder `/work`. The approval prompt is confirmed unless
 * `promptAnswers` says otherwise.
 */
function createService({ dotEnv, engineClient, ...options }: ServiceOptions = {}) {
    const host = createTestHost({
        folders: [PROJECT_DIR],
        ...options,
        files: { ...(dotEnv && { "/work/.env": dotEnvContent(dotEnv) }), ...options.files },
        promptAnswers: { credentialApproval: true, ...options.promptAnswers },
    });
    const restClient = {
        startInstance: vi.fn(),
    };
    const artifactService = {
        getPayloadPaths: vi.fn(),
    };
    const credentialApproval = new CredentialApprovalService(host.secrets, host.picker);
    const readFile = vi.spyOn(host.workspace, "readFile");

    const service = new StartInstanceService(
        host.documents,
        host.workspace,
        (engineClient ?? restClient) as never,
        host.notifier,
        host.picker,
        artifactService as never,
        new EnvValueResolver(host.workspace),
        credentialApproval,
    );

    return {
        service,
        host,
        restClient,
        artifactService,
        readFile,
    };
}

/** The production REST stack down to `fetch`, so a failure's message is the shipped one. */
function createRealRestClient(): Camunda7RestClient {
    const httpClient = new FetchHttpClient();
    return new Camunda7RestClient(httpClient, new AuthHeaderResolver(httpClient));
}

function stubFetch(respond: (url: string, init?: RequestInit) => Promise<Response>) {
    const fetchStub = vi.fn(respond);
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
}

/** undici refuses a URL with userinfo with a TypeError that quotes the whole URL. */
function rejectCredentialledUrlsLikeUndici() {
    return stubFetch(async (url) => {
        throw new TypeError(
            `Request cannot be constructed from a URL that includes credentials: ${url}`,
        );
    });
}

/** A gateway refusing the request by quoting it back: its URL and the decoded basic credentials. */
function refuseQuotingRequest() {
    return stubFetch(async (url, init) => {
        const { Authorization = "" } = init?.headers as Record<string, string>;
        const credentials = Buffer.from(Authorization.replace(/^Basic /, ""), "base64").toString();
        return new Response(
            JSON.stringify({ message: `Gateway refused ${url} for ${credentials}` }),
            { status: 403 },
        );
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("StartInstanceService.getProcessDefinitionKey", () => {
    it("returns the process id extracted from the editor's BPMN content", () => {
        const { service, host } = createService();
        host.openEditor("/work/other.bpmn", "<bpmn:definitions/>");
        const editor = host.openEditor("/work/order.bpmn", C7_DOC.xml);

        expect(service.getProcessDefinitionKey(editor.id)).toBe("Process_0gjrx3e");
    });

    it("propagates the error when the content has no process element", () => {
        const { service, host } = createService();
        const editor = host.openEditor("/work/order.bpmn", "<bpmn:definitions/>");

        expect(() => service.getProcessDefinitionKey(editor.id)).toThrow();
    });
});

describe("StartInstanceService.selectPayloadFile", () => {
    it("shows an info notice and returns null when no payload files exist", async () => {
        const { service, host, artifactService } = createService();
        const editor = host.openEditor("/work/order.bpmn");
        artifactService.getPayloadPaths.mockResolvedValue([]);

        const result = await service.selectPayloadFile(editor.id);

        expect(result).toBeNull();
        expect(host.notifier.infos).toEqual([
            "No payload files found in <configFolder>/payloads/.",
        ]);
        expect(host.picker.prompts).toEqual([]);
    });

    it("walks up from the document directory and delegates selection to the picker", async () => {
        const payloads = ["/work/sub/payloads/a.json", "/work/payloads/b.json"];
        const { service, host, artifactService } = createService({
            promptAnswers: { payloadFile: payloads[0] },
        });
        const editor = host.openEditor("/work/sub/order.bpmn");
        artifactService.getPayloadPaths.mockResolvedValue(payloads);

        const result = await service.selectPayloadFile(editor.id);

        expect(result).toEqual({ filePath: payloads[0], label: "a.json" });
        // Discovery starts from the document's directory, not the file path.
        expect(artifactService.getPayloadPaths).toHaveBeenCalledWith("/work/sub");
        expect(host.picker.prompts).toEqual([
            { method: "choose", args: [payloadFilePrompt(payloads)] },
        ]);
    });

    it("returns null when payloads exist but the user cancels the picker", async () => {
        const { service, host, artifactService } = createService();
        const editor = host.openEditor("/work/order.bpmn");
        artifactService.getPayloadPaths.mockResolvedValue(["/work/payloads/a.json"]);

        await expect(service.selectPayloadFile(editor.id)).resolves.toBeNull();
    });
});

describe("StartInstanceService.startInstance", () => {
    it("reads and parses the payload, then forwards a parsed config to the REST client", async () => {
        const { service, restClient } = createService({
            files: { "/work/payloads/a.json": '{"amount":42}' },
        });
        const success = new StartInstanceResult(true, "started", "pi-1");
        restClient.startInstance.mockResolvedValue(success);

        const result = await service.startInstance(
            "Process_0gjrx3e",
            "http://localhost:8080/engine-rest",
            "c7",
            new NoAuth(),
            "/work/payloads/a.json",
            undefined,
            undefined,
            AD_HOC,
        );

        expect(result).toBe(success);
        const config = restClient.startInstance.mock.calls[0][0] as StartInstanceConfig;
        expect(config.processDefinitionKey).toBe("Process_0gjrx3e");
        expect(config.payload).toEqual({ amount: 42 });
    });

    it("passes a null payload when no payload path is given and never reads a file", async () => {
        const { service, restClient, readFile } = createService();
        const success = new StartInstanceResult(true, "started", "pi-1");
        restClient.startInstance.mockResolvedValue(success);

        await service.startInstance(
            "Process_1",
            "http://c/api",
            "c8",
            new NoAuth(),
            "",
            undefined,
            undefined,
            AD_HOC,
        );

        const config = restClient.startInstance.mock.calls[0][0] as StartInstanceConfig;
        expect(config.payload).toBeNull();
        expect(readFile).not.toHaveBeenCalled();
    });

    it("passes a failed REST result straight through without logging", async () => {
        const { service, host, restClient } = createService();
        const failure = new StartInstanceResult(false, "rejected by server");
        restClient.startInstance.mockResolvedValue(failure);

        const result = await service.startInstance(
            "Process_1",
            "http://c/api",
            "c7",
            new NoAuth(),
            "",
            undefined,
            undefined,
            AD_HOC,
        );

        expect(result).toBe(failure);
        expect(host.notifier.logged("error")).toEqual([]);
    });

    it("never throws: a rejected REST call becomes a failed result and is logged", async () => {
        const { service, host, restClient } = createService();
        const networkDown = new Error("network down");
        restClient.startInstance.mockRejectedValue(networkDown);

        const result = await service.startInstance(
            "Process_1",
            "http://c/api",
            "c7",
            new NoAuth(),
            "",
            undefined,
            undefined,
            AD_HOC,
        );

        expect(result.success).toBe(false);
        expect(result.message).toBe("network down");
        expect(host.notifier.logged("error")).toEqual([networkDown.stack]);
    });

    it("never throws: malformed payload JSON becomes a failed result and skips the REST call", async () => {
        const { service, host, restClient } = createService({
            files: { "/work/payloads/bad.json": "{ not json" },
        });

        const result = await service.startInstance(
            "Process_1",
            "http://c/api",
            "c7",
            new NoAuth(),
            "/work/payloads/bad.json",
            undefined,
            undefined,
            AD_HOC,
        );

        expect(result.success).toBe(false);
        expect(restClient.startInstance).not.toHaveBeenCalled();
        expect(host.notifier.logged("error")).toHaveLength(1);
    });

    it("resolves prefixed refs in endpoint, auth, and URL before the REST call", async () => {
        const { service, restClient } = createService({
            dotEnv: { MIRAGON_STAGE: "prod", MIRAGON_TOKEN: "t0ken" },
        });
        restClient.startInstance.mockResolvedValue(new StartInstanceResult(true, "started"));
        const auth = new BasicAuth("admin", "${env:MIRAGON_TOKEN}");

        await service.startInstance(
            "Process_1",
            "https://camunda.${env:MIRAGON_STAGE}.example/engine-rest",
            "c7",
            auth,
            "",
            "https://gw.${env:MIRAGON_STAGE}.example/{processDefinitionKey}/start",
            "/work",
            AD_HOC,
        );

        const config = restClient.startInstance.mock.calls[0][0] as StartInstanceConfig;
        expect(config.endpoint).toBe("https://camunda.prod.example/engine-rest");
        expect((config.auth as BasicAuth).username).toBe("admin");
        expect((config.auth as BasicAuth).password).toBe("t0ken");
        // Env expands first; {processDefinitionKey} is left for the REST client.
        expect(config.startInstanceUrl).toBe(
            "https://gw.prod.example/{processDefinitionKey}/start",
        );
        expect(auth.password).toBe("${env:MIRAGON_TOKEN}");
    });

    it("logs the resolved start URL's host as a breadcrumb, never its credentials or path", async () => {
        const { service, host, restClient } = createService({
            dotEnv: { MIRAGON_GATEWAY: "https://admin:s3cret@gw.prod.example:8443" },
        });
        restClient.startInstance.mockResolvedValue(new StartInstanceResult(true, "started"));

        await service.startInstance(
            "Process_1",
            "https://camunda.example/engine-rest",
            "c7",
            new NoAuth(),
            "",
            "${env:MIRAGON_GATEWAY}/gateway-path/{processDefinitionKey}/start",
            "/work",
            AD_HOC,
        );

        expect(host.notifier.logged("info")).toContain(
            "Instance start requested: Process_1 @ gw.prod.example:8443",
        );
        const logged = host.notifier.logged("info").join("\n");
        expect(logged).not.toMatch(/admin|s3cret|gateway-path|\$\{env:/);
    });

    it("logs the endpoint's host as the breadcrumb when no start URL is set", async () => {
        const { service, host, restClient } = createService();
        restClient.startInstance.mockResolvedValue(new StartInstanceResult(true, "started"));

        await service.startInstance(
            "Process_1",
            "https://camunda.example/engine-rest",
            "c8",
            new NoAuth(),
            "",
            undefined,
            undefined,
            AD_HOC,
        );

        expect(host.notifier.logged("info")).toContain(
            "Instance start requested: Process_1 @ camunda.example",
        );
    });

    it("returns a failed result naming the variable when a referenced variable is unset", async () => {
        const { service, restClient } = createService({ dotEnv: { MIRAGON_OTHER: "x" } });
        restClient.startInstance.mockResolvedValue(new StartInstanceResult(true, "started"));

        const result = await service.startInstance(
            "Process_1",
            "https://camunda.${env:MIRAGON_MISSING_STAGE}/rest",
            "c7",
            new NoAuth(),
            "",
            undefined,
            "/work",
            AD_HOC,
        );

        expect(result.success).toBe(false);
        // The .env path is the remedy: it tells the user where to define the variable.
        expect(result.message).toBe(
            new UnresolvedEnvVariableError("MIRAGON_MISSING_STAGE", "endpoint", "/work/.env")
                .message,
        );
        expect(restClient.startInstance).not.toHaveBeenCalled();
    });

    it("refuses a reference to a variable outside the modeler prefix before calling the engine", async () => {
        const { service, host, restClient } = createService({
            dotEnv: { AWS_SECRET_ACCESS_KEY: "leak" },
        });

        const result = await service.startInstance(
            "Process_1",
            "https://camunda.example/rest",
            "c7",
            new BasicAuth("admin", "${env:AWS_SECRET_ACCESS_KEY}"),
            "",
            undefined,
            "/work",
            AD_HOC,
        );

        expect(result.success).toBe(false);
        expect(result.message).toBe(
            new DisallowedEnvReferenceError("auth.password", ENV_VARIABLE_PREFIX).message,
        );
        expect(result.message).not.toContain("leak");
        expect(restClient.startInstance).not.toHaveBeenCalled();
        expect(host.notifier.logged("info")).toEqual([]);
    });

    it("sends the exact resolved secret for a whole ref padded with whitespace", async () => {
        const { service, restClient } = createService({ dotEnv: { MIRAGON_PW: "s3cret" } });
        restClient.startInstance.mockResolvedValue(new StartInstanceResult(true, "started"));

        await service.startInstance(
            "Process_1",
            "https://camunda.example/engine-rest",
            "c7",
            new BasicAuth("admin", " ${env:MIRAGON_PW}  "),
            "",
            undefined,
            "/work",
            AD_HOC,
        );

        const config = restClient.startInstance.mock.calls[0][0] as StartInstanceConfig;
        expect((config.auth as BasicAuth).password).toBe("s3cret");
    });

    it("rejects an endpoint whose variable is set to an empty value before calling the engine", async () => {
        const { service, restClient } = createService({ dotEnv: { MIRAGON_URL: "" } });

        const result = await service.startInstance(
            "Process_1",
            "${env:MIRAGON_URL}",
            "c7",
            new NoAuth(),
            "",
            undefined,
            "/work",
            AD_HOC,
        );

        expect(result.success).toBe(false);
        expect(result.message).toBe(new InvalidDeploymentConfigError(["endpoint"]).message);
        expect(restClient.startInstance).not.toHaveBeenCalled();
    });

    it("posts to the convention start route when the override's variable is set to an empty value", async () => {
        const fetchStub = stubFetch(
            async () => new Response(JSON.stringify({ id: "pi-1" }), { status: 200 }),
        );
        const { service, host } = createService({
            dotEnv: { MIRAGON_START: "" },
            engineClient: createRealRestClient(),
        });

        const result = await service.startInstance(
            "Process_1",
            "https://camunda.example/engine-rest",
            "c7",
            new NoAuth(),
            "",
            "${env:MIRAGON_START}",
            "/work",
            AD_HOC,
        );

        expect(result).toMatchObject({ success: true, processInstanceId: "pi-1" });
        expect(fetchStub).toHaveBeenCalledExactlyOnceWith(
            "https://camunda.example/engine-rest/process-definition/key/Process_1/start",
            expect.anything(),
        );
        expect(host.notifier.logged("info")).toContain(
            "Instance start requested: Process_1 @ camunda.example",
        );
    });

    it("keeps credentials embedded in a resolved endpoint out of the result and every log when the request fails", async () => {
        const credentialledEndpoint = "https://deployer:s3cret@camunda.invalid/engine-rest";
        const rejected = new HttpTransportError(
            "camunda.invalid",
            "the URL must not contain credentials; use the authentication fields",
        );
        const fetchStub = rejectCredentialledUrlsLikeUndici();
        const { service, host } = createService({
            dotEnv: { MIRAGON_URL: credentialledEndpoint },
            engineClient: createRealRestClient(),
        });

        const result = await service.startInstance(
            "Process_1",
            "${env:MIRAGON_URL}",
            "c7",
            new NoAuth(),
            "",
            undefined,
            "/work",
            AD_HOC,
        );

        // The rejection really quoted the secret, so its absence below is the redaction.
        expect(fetchStub).toHaveBeenCalledExactlyOnceWith(
            `${credentialledEndpoint}/process-definition/key/Process_1/start`,
            expect.anything(),
        );
        expect(result.success).toBe(false);
        expect(result.message).toBe(rejected.message);
        expect(host.notifier.logged("error")).toEqual([
            expect.stringContaining(`HttpTransportError: ${rejected.message}\n`),
        ]);
        expect(host.notifier.loggedErrors).toEqual([
            expect.objectContaining({ host: rejected.host, reason: rejected.reason }),
        ]);
        expect(host.notifier.loggedErrors[0]).toBeInstanceOf(HttpTransportError);
        expect(host.notifier.logged("info")).toContain(
            "Instance start requested: Process_1 @ camunda.invalid",
        );
        expect(result.message).not.toContain("s3cret");
        expect(host.notifier.transcript()).not.toContain("s3cret");
    });

    it("masks a resolved .env value and a literal password in the result and every log when the engine quotes the request", async () => {
        const token = "tok-9f8e7d";
        const literalPassword = "lit-pa55word";
        const fetchStub = refuseQuotingRequest();
        const { service, host } = createService({
            dotEnv: { MIRAGON_TOKEN: token },
            engineClient: createRealRestClient(),
        });

        const result = await service.startInstance(
            "Process_1",
            "https://camunda.example/engine-rest",
            "c7",
            new BasicAuth("admin", literalPassword),
            "",
            "https://gw.example/hooks/${env:MIRAGON_TOKEN}/{processDefinitionKey}/start",
            "/work",
            AD_HOC,
        );

        expect(fetchStub).toHaveBeenCalledExactlyOnceWith(
            `https://gw.example/hooks/${token}/Process_1/start`,
            expect.anything(),
        );
        expect(result.success).toBe(false);
        expect(result.message).toBe(
            "Start instance failed with HTTP 403: Gateway refused https://gw.example/hooks/***/Process_1/start for ***:***",
        );
        const transcript = host.notifier.transcript();
        for (const secret of [token, literalPassword]) {
            expect(result.message).not.toContain(secret);
            expect(transcript).not.toContain(secret);
        }
    });

    it("never reads .env when nothing references it, so a broken .env can't fail the start", async () => {
        const { service, host, restClient, readFile } = createService({
            dotEnv: { MIRAGON_URL: "https://camunda.example/rest" },
        });
        // A symlinked .env is refused when read, so reading it would fail the start.
        host.workspace.symbolicLinks.add("/work/.env");
        const isSymbolicLink = vi.spyOn(host.workspace, "isSymbolicLink");
        const success = new StartInstanceResult(true, "started", "pi-1");
        restClient.startInstance.mockResolvedValue(success);

        const result = await service.startInstance(
            "Process_1",
            "https://camunda.example/rest",
            "c7",
            new BasicAuth("admin", "secret"),
            "",
            "https://gw.example/{processDefinitionKey}/start",
            "/work",
            AD_HOC,
        );

        expect(result).toBe(success);
        expect(isSymbolicLink).not.toHaveBeenCalled();
        expect(readFile).not.toHaveBeenCalled();
    });
});

describe("StartInstanceService.startInstance .env choice", () => {
    const NESTED_PROJECT_DIR = "/work/team";

    /**
     * Workspace folders `/other` and `/work`, the latter holding a nested project
     * with its own targets file and `.env`. Every `.env` names a different host.
     */
    function createNestedProjectService() {
        const context = createService({
            // Listed first, so a lookup that dropped the document's directory would land here.
            folders: ["/other", PROJECT_DIR],
            files: {
                "/other/.env": "MIRAGON_URL=https://other-folder.example/engine-rest",
                "/work/.env": "MIRAGON_URL=https://workspace.example/engine-rest",
                "/work/team/.env": "MIRAGON_URL=https://team.example/engine-rest",
            },
        });
        context.restClient.startInstance.mockResolvedValue(
            new StartInstanceResult(true, "started"),
        );
        return context;
    }

    const startWithEndpointRef = (
        service: StartInstanceService,
        destination: DeploymentDestination,
    ) =>
        service.startInstance(
            "Process_1",
            "${env:MIRAGON_URL}",
            "c7",
            new NoAuth(),
            "",
            undefined,
            NESTED_PROJECT_DIR,
            destination,
        );

    it("reads the workspace folder's .env for an ad-hoc start, never a nested targets file's", async () => {
        const { service, restClient, readFile } = createNestedProjectService();

        await startWithEndpointRef(service, AD_HOC);

        expect(readFile).toHaveBeenCalledExactlyOnceWith("/work/.env");
        const config = restClient.startInstance.mock.calls[0][0] as StartInstanceConfig;
        expect(config.endpoint).toBe("https://workspace.example/engine-rest");
    });

    it("reads the .env beside the targets file of a named target", async () => {
        const { service, restClient, readFile } = createNestedProjectService();

        await startWithEndpointRef(service, named(NAMED_TARGET, NESTED_PROJECT_DIR));

        expect(readFile).toHaveBeenCalledExactlyOnceWith("/work/team/.env");
        const config = restClient.startInstance.mock.calls[0][0] as StartInstanceConfig;
        expect(config.endpoint).toBe("https://team.example/engine-rest");
    });
});

describe("StartInstanceService.startInstance credential approval", () => {
    const DECLINED = new CredentialDestinationNotApprovedError("dev");

    it("asks to approve the origin a named target's start URL resolves to before starting", async () => {
        const { service, host, restClient } = createService({
            dotEnv: {
                MIRAGON_URL: "https://camunda.example/engine-rest",
                MIRAGON_GATEWAY: "https://gw.example:8443",
            },
        });
        let approvedAtStart: string[] | undefined;
        restClient.startInstance.mockImplementation(async () => {
            approvedAtStart = await host.secrets.getApprovedDestinations(DEV_SLOT);
            return new StartInstanceResult(true, "started");
        });

        await service.startInstance(
            "Process_1",
            "${env:MIRAGON_URL}",
            "c7",
            new BasicAuth("admin", "s3cret"),
            "",
            "${env:MIRAGON_GATEWAY}/{processDefinitionKey}/start",
            PROJECT_DIR,
            named(NAMED_TARGET),
        );

        expect(host.picker.prompts).toEqual([
            {
                method: "confirm",
                args: [
                    expect.objectContaining({
                        id: "credentialApproval",
                        title: "Send credentials and .env values to https://gw.example:8443?",
                    }),
                ],
            },
        ]);
        expect(approvedAtStart).toEqual(["https://gw.example:8443"]);
    });

    it("starts nothing when the user declines the destination", async () => {
        const { service, restClient } = createService({
            dotEnv: { MIRAGON_URL: "https://moved.example/engine-rest" },
            promptAnswers: { credentialApproval: false },
        });
        restClient.startInstance.mockResolvedValue(new StartInstanceResult(true, "started"));

        const result = await service.startInstance(
            "Process_1",
            "${env:MIRAGON_URL}",
            "c7",
            new BasicAuth("admin", "s3cret"),
            "",
            undefined,
            PROJECT_DIR,
            named(NAMED_TARGET),
        );

        expect(result).toMatchObject({ success: false, message: DECLINED.message });
        expect(restClient.startInstance).not.toHaveBeenCalled();
    });

    it("never asks on an ad-hoc start whose values are all typed, even beside a .env", async () => {
        const { service, host, restClient } = createService({
            dotEnv: { MIRAGON_URL: "https://from-env.example/engine-rest" },
        });
        restClient.startInstance.mockResolvedValue(new StartInstanceResult(true, "started"));

        const result = await service.startInstance(
            "Process_1",
            "https://typed.example/engine-rest",
            "c7",
            new BasicAuth("admin", "s3cret"),
            "",
            undefined,
            PROJECT_DIR,
            AD_HOC,
        );

        expect(result.success).toBe(true);
        expect(host.picker.prompts).toEqual([]);
    });

    it.each([
        [
            "its endpoint",
            { MIRAGON_URL: "https://from-env.example:8443/engine-rest" },
            "${env:MIRAGON_URL}",
            new NoAuth(),
            "https://from-env.example:8443",
        ],
        [
            "its password",
            { MIRAGON_PW: "s3cret" },
            "https://typed.example/engine-rest",
            new BasicAuth("admin", "${env:MIRAGON_PW}"),
            "https://typed.example",
        ],
    ])(
        "asks under the ad-hoc approvals before an ad-hoc start takes %s from .env",
        async (_field, dotEnv, endpoint, auth, origin) => {
            const { service, host, restClient } = createService({ dotEnv });
            let approvedAtStart: string[] | undefined;
            restClient.startInstance.mockImplementation(async () => {
                approvedAtStart = await host.secrets.getApprovedDestinations("ad-hoc");
                return new StartInstanceResult(true, "started");
            });

            await service.startInstance(
                "Process_1",
                endpoint,
                "c7",
                auth,
                "",
                undefined,
                PROJECT_DIR,
                AD_HOC,
            );

            expect(host.picker.prompts).toEqual([
                {
                    method: "confirm",
                    args: [
                        expect.objectContaining({
                            id: "credentialApproval",
                            title: `Send credentials and .env values to ${origin}?`,
                        }),
                    ],
                },
            ]);
            expect(approvedAtStart).toEqual([origin]);
        },
    );

    it("starts nothing when the user declines an ad-hoc endpoint from .env", async () => {
        const declinedAdHoc = new CredentialDestinationNotApprovedError("ad-hoc");
        const { service, restClient } = createService({
            dotEnv: { MIRAGON_URL: "https://from-env.example/engine-rest" },
            promptAnswers: { credentialApproval: false },
        });
        restClient.startInstance.mockResolvedValue(new StartInstanceResult(true, "started"));

        const result = await service.startInstance(
            "Process_1",
            "${env:MIRAGON_URL}",
            "c7",
            new BasicAuth("admin", "s3cret"),
            "",
            undefined,
            PROJECT_DIR,
            AD_HOC,
        );

        expect(result).toMatchObject({ success: false, message: declinedAdHoc.message });
        expect(restClient.startInstance).not.toHaveBeenCalled();
    });
});
