import { posix } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
    BasicAuth,
    DeploymentConfig,
    DeploymentConfigBuilder,
    DeploymentResult,
    NoAuth,
    OAuth2Auth,
} from "../domain/deployment";
import { AdHocDestination, NamedDestination } from "../domain/deploymentDestination";
import { contentFingerprint } from "../domain/deploymentLedger";
import { additionalFilesPrompt } from "../domain/deploymentPrompts";
import { fileChoice } from "../../kernel/domain/fileChoices";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { ENV_VARIABLE_PREFIX } from "../domain/envRef";
import { CamundaEnginePort } from "../domain/ports";
import { FetchHttpClient } from "../../kernel/infrastructure/FetchHttpClient";
import { AuthHeaderResolver } from "../infrastructure/camunda/AuthHeaderResolver";
import { Camunda7RestClient } from "../infrastructure/camunda/Camunda7RestClient";
import { CredentialApprovalService } from "./CredentialApprovalService";
import { DeploymentService } from "./DeploymentService";
import { DeploymentStatusService } from "./DeploymentStatusService";
import { EnvValueResolver } from "./EnvValueResolver";
import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import {
    CredentialDestinationNotApprovedError,
    DisallowedEnvReferenceError,
    InvalidDeploymentConfigError,
    UnreadableDotEnvError,
    UnresolvedEnvVariableError,
} from "../domain/errors";
import { HttpTransportError } from "../../kernel/domain/http";
import { createTestHost, Prompt, TestHostOptions } from "../../testing";
import { Engine } from "@miragon/bpmn-modeler-types";

// A real, valid C8 document so `detectEngine` exercises the production
// `BpmnDocument.detectPlatform` path instead of a stub.
const C8_XML = BpmnDocument.empty("c8", "8.8.0").xml;

const TARGET_SLOT = `${targetsFileOf("/work")}::dev`;
const AD_HOC_SLOT = "ad-hoc";
const MAIN_FILE = { "/work/order-process.bpmn": "<xml/>" };

/** `.env` variables, or the error reading that `.env` fails with. */
type DotEnvFile = Record<string, string> | Error;

interface ServiceOptions extends TestHostOptions {
    /**
     * `.env` files keyed by directory. Unless `folders` says otherwise, `/work`
     * and every such directory is its own workspace folder.
     */
    dotEnvFiles?: Record<string, DotEnvFile>;
    /** Replaces the REST client mock, e.g. with the real stack over a stubbed `fetch`. */
    engineClient?: CamundaEnginePort;
}

/**
 * The env resolver and credential approval are real, so a test can assert what
 * the REST client vs. the secret store see and whether `.env` was read at all.
 * Every credential prompt is confirmed unless `promptAnswers` declines it.
 */
function createService({ dotEnvFiles = {}, engineClient, ...hostOptions }: ServiceOptions = {}) {
    const dotEnvContents = Object.entries(dotEnvFiles).flatMap(([dir, dotEnv]) =>
        dotEnv instanceof Error
            ? []
            : [
                  [
                      posix.join(dir, ".env"),
                      Object.entries(dotEnv)
                          .map(([key, value]) => `${key}=${value}`)
                          .join("\n"),
                  ],
              ],
    );
    const host = createTestHost({
        ...hostOptions,
        folders: hostOptions.folders ?? [...new Set(["/work", ...Object.keys(dotEnvFiles)])],
        files: { ...Object.fromEntries(dotEnvContents), ...hostOptions.files },
        promptAnswers: { credentialApproval: true, ...hostOptions.promptAnswers },
    });
    const readWorkspaceFile = host.workspace.readFile.bind(host.workspace);
    const readFile = vi.spyOn(host.workspace, "readFile").mockImplementation(async (filePath) => {
        const dotEnv = dotEnvFiles[posix.dirname(filePath)];
        if (posix.basename(filePath) === ".env" && dotEnv instanceof Error) {
            throw dotEnv;
        }
        return readWorkspaceFile(filePath);
    });

    const envResolver = new EnvValueResolver(host.workspace);
    const credentialApproval = new CredentialApprovalService(host.secrets, host.picker);

    const restClient = {
        deploy: vi.fn(),
        startInstance: vi.fn(),
    };
    const deploymentStatus = new DeploymentStatusService(
        host.store,
        host.documents,
        // No editor is tracked, so the refresh after recording never reads the active target.
        {} as never,
        host.deploymentState,
        host.statusBar,
        host.picker,
        host.notifier,
        envResolver,
        host.settings,
    );

    const service = new DeploymentService(
        host.documents,
        host.workspace,
        host.deploymentState,
        (engineClient ?? restClient) as never,
        host.notifier,
        host.picker,
        host.secrets,
        deploymentStatus,
        envResolver,
        credentialApproval,
    );

    return {
        service,
        host,
        restClient,
        deploymentStatus: { recordDeployment: vi.spyOn(deploymentStatus, "recordDeployment") },
        dotEnvReads: () =>
            readFile.mock.calls
                .map(([filePath]) => filePath)
                .filter((filePath) => posix.basename(filePath) === ".env"),
    };
}

function targetsFileOf(projectDir: string): string {
    return posix.join(projectDir, ".camunda", "deployment-targets.json");
}

/** The ledger row a local deploy of `<xml/>` leaves behind. */
function recordedRevision(deploymentId: string) {
    return {
        fingerprint: contentFingerprint("<xml/>"),
        deployedAt: expect.any(String),
        deploymentId,
        origin: "local",
    };
}

function xmlFiles(...paths: string[]): Record<string, string> {
    return Object.fromEntries(paths.map((path) => [path, "<xml/>"]));
}

/** A minimal valid config; callers override only the fields a test cares about. */
function buildConfig(
    overrides: Partial<{
        auth: NoAuth | BasicAuth | OAuth2Auth;
        mainFilePath: string;
        additionalFilePaths: string[];
        endpoint: string;
        tenantId: string;
        engine: Engine;
        deployUrl: string;
    }> = {},
): DeploymentConfig {
    return new DeploymentConfigBuilder()
        .withDeploymentName("order-process")
        .withEndpoint(overrides.endpoint ?? "http://localhost:8080/engine-rest")
        .withTenantId(overrides.tenantId ?? "")
        .withEngine(overrides.engine ?? "c7")
        .withMainFilePath(overrides.mainFilePath ?? "/work/order-process.bpmn")
        .withAdditionalFilePaths(overrides.additionalFilePaths ?? [])
        .withAuth(overrides.auth ?? new NoAuth())
        .withDeployUrl(overrides.deployUrl)
        .build();
}

function targetAt(endpoint: string, tenantId = ""): DeploymentTarget {
    return new DeploymentTarget("dev", "c7", endpoint, tenantId, "none", "", "");
}

/** `target` in the project holding its own targets file, keyed like the real slot. */
function named(target: DeploymentTarget, projectDir = "/work"): NamedDestination {
    return new NamedDestination(target, {
        filePath: targetsFileOf(projectDir),
        exists: true,
        projectDir,
    });
}

/** Deploys over the ad-hoc connection the config names, as the dispatcher does. */
function deployAdHoc(service: DeploymentService, config: DeploymentConfig) {
    return service.deploy(config, new AdHocDestination(config.endpoint, config.tenantId));
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

/** The prompt asking to send `connection`'s credentials and `.env` values to `origins`. */
function approvalPrompt(origins: string, connection: string): Prompt {
    return {
        method: "confirm",
        args: [
            expect.objectContaining({
                id: "credentialApproval",
                title: `Send credentials and .env values to ${origins}?`,
                details: expect.arrayContaining([`They belong to ${connection}.`]),
            }),
        ],
    };
}

/** Succeeds every deploy, noting what `slot` had approved as each request went out. */
function approvalsAtEachDeploy(
    { host, restClient }: Pick<ReturnType<typeof createService>, "host" | "restClient">,
    slot: string,
): string[][] {
    const approvals: string[][] = [];
    restClient.deploy.mockImplementation(async () => {
        approvals.push(await host.secrets.getApprovedDestinations(slot));
        return new DeploymentResult(true, "ok");
    });
    return approvals;
}

const ENV_TOKEN = "tok-9f8e7d";
const LITERAL_PASSWORD = "lit-pa55word";
const DECLINED = new CredentialDestinationNotApprovedError("dev");

const CREDENTIALLED_ENDPOINT = "https://deployer:s3cret@camunda.invalid/engine-rest";
const CREDENTIALLED_URL_REJECTED = new HttpTransportError(
    "camunda.invalid",
    "the URL must not contain credentials; use the authentication fields",
);

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("DeploymentService.getFormDefaults", () => {
    it("derives the deployment name from the filename and auto-detects the engine", () => {
        const { service, host } = createService();
        const editor = host.openEditor("/work/order-process.bpmn", C8_XML);
        host.deploymentState.seed({ endpoint: "https://camunda.example/api", tenantId: "acme" });

        const defaults = service.getFormDefaults(editor.id);

        expect(defaults.deploymentName).toBe("order-process");
        expect(defaults.engine).toBe("c8");
        expect(defaults.endpoint).toBe("https://camunda.example/api");
        expect(defaults.tenantId).toBe("acme");
    });

    it("falls back to the c7 engine when platform detection fails", () => {
        const { service, host } = createService();
        // No platform markers → detectPlatform throws, caught internally.
        const editor = host.openEditor("/work/order-process.bpmn", "<bpmn:definitions/>");

        const defaults = service.getFormDefaults(editor.id);

        // The name is still derived because it is computed before detection.
        expect(defaults.deploymentName).toBe("order-process");
        expect(defaults.engine).toBe("c7");
    });

    it("uses empty defaults when there is no active editor", () => {
        const { service } = createService();

        const defaults = service.getFormDefaults("editor-1");

        expect(defaults.deploymentName).toBe("");
        expect(defaults.engine).toBe("c7");
    });

    it("defaults the endpoint to the local engine-rest URL when none is stored", () => {
        const { service, host } = createService();
        const editor = host.openEditor("/work/p.bpmn", C8_XML);

        const defaults = service.getFormDefaults(editor.id);

        expect(defaults.endpoint).toBe("http://localhost:8080/engine-rest");
    });
});

describe("DeploymentService.getStoredCredentials", () => {
    it("returns basic credentials when basic auth is stored", async () => {
        const { service, host } = createService();
        host.deploymentState.seed({ authType: "basic" });
        await host.secrets.saveBasicAuth("admin", "secret");

        await expect(service.getStoredCredentials()).resolves.toEqual({
            authType: "basic",
            username: "admin",
            password: "secret",
        });
    });

    it("returns oauth2 credentials plus the stored token endpoint and audience", async () => {
        const { service, host } = createService();
        host.deploymentState.seed({
            authType: "oauth2",
            tokenEndpoint: "https://idp/token",
            audience: "zeebe-api",
        });
        await host.secrets.saveOAuth2("cid", "csecret");

        await expect(service.getStoredCredentials()).resolves.toEqual({
            authType: "oauth2",
            clientId: "cid",
            clientSecret: "csecret",
            tokenEndpoint: "https://idp/token",
            audience: "zeebe-api",
        });
    });

    it("returns a none payload when the auth type is basic but no secret exists", async () => {
        const { service, host } = createService();
        host.deploymentState.seed({ authType: "basic" });

        await expect(service.getStoredCredentials()).resolves.toEqual({ authType: "none" });
    });

    it("returns a none payload when no auth is configured", async () => {
        const { service } = createService();

        await expect(service.getStoredCredentials()).resolves.toEqual({ authType: "none" });
    });
});

describe("DeploymentService.selectAdditionalFiles", () => {
    const RESOURCES = {
        "/work/forms/order.form": "{}",
        "/work/payloads/vars.json": "{}",
        "/work/decisions/discount.dmn": "<definitions/>",
    };

    it("offers the workspace's forms, JSON files and decisions, ordered as VS Code shows them", async () => {
        const { service, host } = createService({
            folders: ["/work", "/archive/zeta"],
            files: {
                ...RESOURCES,
                "/archive/zeta/legacy.form": "{}",
                "/work/order.bpmn": "<definitions/>",
                "/work/element-templates/task.json": "[]",
            },
            promptAnswers: {
                additionalFiles: ["/work/forms/order.form", "/work/decisions/discount.dmn"],
            },
        });

        const result = await service.selectAdditionalFiles();

        expect(result).toEqual(["/work/forms/order.form", "/work/decisions/discount.dmn"]);
        expect(host.picker.prompts).toEqual([
            {
                method: "chooseMany",
                args: [
                    {
                        id: "additionalFiles",
                        placeholder: "Select additional files to include in the deployment",
                        items: [
                            "/work/decisions/discount.dmn",
                            "/work/forms/order.form",
                            "/work/payloads/vars.json",
                            "/archive/zeta/legacy.form",
                        ].map(fileChoice),
                    },
                ],
            },
        ]);
    });

    it("offers no file inside node_modules or build output", async () => {
        const { service, host } = createService({
            files: {
                ...RESOURCES,
                "/work/node_modules/left-pad/package.json": "{}",
                "/work/target/classes/discount.dmn": "<definitions/>",
            },
        });

        await service.selectAdditionalFiles();

        expect(host.picker.prompts).toEqual([
            {
                method: "chooseMany",
                args: [
                    additionalFilesPrompt({
                        files: Object.keys(RESOURCES),
                        workspaceFolders: ["/work"],
                    }),
                ],
            },
        ]);
    });

    it("offers at most 20 files and returns none when the user dismisses the list", async () => {
        const forms = Object.fromEntries(
            Array.from({ length: 21 }, (_, index) => [`/work/forms/form-${index}.form`, "{}"]),
        );
        const { service, host } = createService({ files: forms });

        await expect(service.selectAdditionalFiles()).resolves.toEqual([]);

        expect(host.picker.prompts).toEqual([
            {
                method: "chooseMany",
                args: [
                    additionalFilesPrompt({
                        files: Object.keys(forms).slice(0, 20),
                        workspaceFolders: ["/work"],
                    }),
                ],
            },
        ]);
    });
});

describe("DeploymentService.deploy", () => {
    it("reads the main and additional files keyed by basename before deploying", async () => {
        const { service, restClient } = createService({
            files: Object.fromEntries(
                ["/work/main.bpmn", "/work/a.form", "/work/b.dmn"].map((p) => [p, `content:${p}`]),
            ),
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));

        await deployAdHoc(
            service,
            buildConfig({
                mainFilePath: "/work/main.bpmn",
                additionalFilePaths: ["/work/a.form", "/work/b.dmn"],
            }),
        );

        const fileContents = restClient.deploy.mock.calls[0][1] as Map<string, string>;
        expect([...fileContents.keys()]).toEqual(["main.bpmn", "a.form", "b.dmn"]);
        expect(fileContents.get("a.form")).toBe("content:/work/a.form");
    });

    it("persists the endpoint, tenant and auth type on success", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        host.deploymentState.seed({ authType: "basic" });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));

        await deployAdHoc(service, buildConfig({ endpoint: "https://c/api", tenantId: "acme" }));

        expect(host.deploymentState.load().endpoint).toBe("https://c/api");
        expect(host.deploymentState.load().tenantId).toBe("acme");
        expect(host.deploymentState.load().authType).toBe("none");
    });

    it("stores basic-auth credentials on success", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deployAdHoc(service, buildConfig({ auth: new BasicAuth("admin", "secret") }));

        expect(host.deploymentState.load().authType).toBe("basic");
        await expect(host.secrets.getBasicAuth()).resolves.toEqual({
            username: "admin",
            password: "secret",
        });
    });

    it("stores oauth2 credentials and config on success", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deployAdHoc(
            service,
            buildConfig({
                auth: new OAuth2Auth("cid", "csecret", "https://idp/token", "zeebe-api"),
            }),
        );

        await expect(host.secrets.getOAuth2()).resolves.toEqual({
            clientId: "cid",
            clientSecret: "csecret",
        });
        expect(host.deploymentState.load().tokenEndpoint).toBe("https://idp/token");
        expect(host.deploymentState.load().audience).toBe("zeebe-api");
    });

    it("persists only credentials under the slot (not legacy state) in target mode", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await service.deploy(
            buildConfig({ auth: new BasicAuth("admin", "secret") }),
            named(targetAt("http://localhost:8080/engine-rest")),
        );

        await expect(host.secrets.getBasicAuth(TARGET_SLOT)).resolves.toEqual({
            username: "admin",
            password: "secret",
        });
        await expect(host.secrets.getBasicAuth()).resolves.toBeUndefined();
        expect(host.deploymentState.load().endpoint).toBe("");
        expect(host.deploymentState.load().tenantId).toBe("");
        expect(host.deploymentState.load().authType).toBe("none");
    });

    it("persists a ref next to a literal to the target slot as typed, sending only the resolved value", async () => {
        const { service, host, restClient } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_USER: "admin" } },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await service.deploy(
            buildConfig({ auth: new BasicAuth("${env:MIRAGON_USER}", "s3cret") }),
            named(targetAt("http://localhost:8080/engine-rest")),
        );

        const sentConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect(sentConfig.auth).toMatchObject({ username: "admin", password: "s3cret" });
        // Blanking the ref would leave an empty half, which a host store may drop with its literal.
        await expect(host.secrets.getBasicAuth(TARGET_SLOT)).resolves.toEqual({
            username: "${env:MIRAGON_USER}",
            password: "s3cret",
        });
    });

    it("sends the exact resolved secret for a whole ref padded with whitespace", async () => {
        const { service, restClient } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_PW: "s3cret" } },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deployAdHoc(
            service,
            buildConfig({ auth: new BasicAuth("admin", "  ${env:MIRAGON_PW} ") }),
        );

        const sentConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect((sentConfig.auth as BasicAuth).password).toBe("s3cret");
    });

    it("records an ad-hoc deploy under the endpoint host and tenant", async () => {
        const { service, restClient, deploymentStatus } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));

        await deployAdHoc(
            service,
            buildConfig({ endpoint: "https://c.example/api", tenantId: "acme" }),
        );

        expect(deploymentStatus.recordDeployment).toHaveBeenCalledOnce();
        const [filePath, content, identity, deploymentId] =
            deploymentStatus.recordDeployment.mock.calls[0];
        expect(filePath).toBe("/work/order-process.bpmn");
        expect(content).toBe("<xml/>");
        expect(identity.key()).toBe("adhoc:c.example/acme");
        expect(deploymentId).toBe("dep-1");
    });

    it("records a target deploy under the target's name and host", async () => {
        const { service, restClient, deploymentStatus } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));

        await service.deploy(
            buildConfig({ endpoint: "https://c.example/api" }),
            named(targetAt("https://c.example/api")),
        );

        expect(deploymentStatus.recordDeployment.mock.calls[0][2].key()).toBe(
            "target:dev@c.example",
        );
    });

    it("keys the request and the ad-hoc ledger identity off a single .env read", async () => {
        const { service, restClient, deploymentStatus, dotEnvReads } = createService({
            files: MAIN_FILE,
            dotEnvFiles: {
                "/work": {
                    MIRAGON_URL: "https://prod.example.com/api",
                    MIRAGON_TENANT: "acme",
                },
            },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
        const config = buildConfig({
            endpoint: "${env:MIRAGON_URL}",
            tenantId: "${env:MIRAGON_TENANT}",
        });

        await deployAdHoc(service, config);

        expect(dotEnvReads()).toEqual(["/work/.env"]);
        const sentConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect(sentConfig.endpoint).toBe("https://prod.example.com/api");
        // Keyed off the resolved values, but only as fingerprints: the ledger is persisted.
        expect(deploymentStatus.recordDeployment.mock.calls[0][2].key()).toBe(
            `adhoc:env:${contentFingerprint("prod.example.com")}/env:${contentFingerprint("acme")}`,
        );
    });

    it("keys the request and the target ledger identity off a single .env read", async () => {
        const { service, restClient, deploymentStatus, dotEnvReads } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_URL: "https://prod.example.com/api" } },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
        const config = buildConfig({ endpoint: "${env:MIRAGON_URL}" });

        await service.deploy(config, named(targetAt("${env:MIRAGON_URL}")));
        expect(dotEnvReads()).toEqual(["/work/.env"]);
        const sentConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect(sentConfig.endpoint).toBe("https://prod.example.com/api");
        expect(deploymentStatus.recordDeployment.mock.calls[0][2].key()).toBe(
            `target:dev@env:${contentFingerprint("prod.example.com")}`,
        );
    });

    it("passes a failed result through without persisting or recording anything", async () => {
        const { service, host, restClient, deploymentStatus } = createService({
            files: MAIN_FILE,
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(false, "rejected by server"));

        const result = await service.deploy(
            buildConfig(),
            named(targetAt("http://localhost:8080/engine-rest")),
        );

        expect(result.success).toBe(false);
        expect(host.deploymentState.load().endpoint).toBe("");
        expect(deploymentStatus.recordDeployment).not.toHaveBeenCalled();
    });

    it("never throws: a rejected REST call becomes a failed result and is logged", async () => {
        const { service, host, restClient, deploymentStatus } = createService({
            files: MAIN_FILE,
        });
        const networkDown = new Error("network down");
        restClient.deploy.mockRejectedValue(networkDown);

        const result = await deployAdHoc(service, buildConfig());

        expect(result.success).toBe(false);
        expect(result.message).toBe("network down");
        expect(host.notifier.logged("error")).toEqual([networkDown.stack]);
        expect(deploymentStatus.recordDeployment).not.toHaveBeenCalled();
    });

    it("never throws: a failed file read becomes a failed result", async () => {
        const { service, host, restClient } = createService();
        vi.spyOn(host.workspace, "readFile").mockRejectedValue(new Error("ENOENT"));

        const result = await deployAdHoc(service, buildConfig());

        expect(result.success).toBe(false);
        expect(result.message).toBe("ENOENT");
        expect(restClient.deploy).not.toHaveBeenCalled();
    });

    it("reports an engine-accepted ad-hoc deploy as deployed and still stores its credentials and ledger row when saving the connection settings throws", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));
        host.deploymentState.failSaves(
            (patch) => patch.endpoint !== undefined,
            new Error("state locked"),
        );

        const result = await deployAdHoc(
            service,
            buildConfig({
                endpoint: "https://c.example/api",
                tenantId: "acme",
                auth: new BasicAuth("admin", "secret"),
            }),
        );

        expect(result).toEqual(
            new DeploymentResult(
                true,
                "ok Not saved: connection settings (state locked).",
                "dep-1",
            ),
        );
        await expect(host.secrets.getBasicAuth()).resolves.toEqual({
            username: "admin",
            password: "secret",
        });
        expect(host.deploymentState.load().ledger).toEqual({
            "adhoc:c.example/acme::/work/order-process.bpmn": recordedRevision("dep-1"),
        });
        expect(host.notifier.logged("warning")).toEqual([
            "Deployment succeeded, but saving its connection settings failed: state locked",
        ]);
    });

    it("saves an ad-hoc deploy's connection in one write, so a failed save leaves the stored connection whole", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));
        const storedConnection = {
            endpoint: "https://old.example/api",
            tenantId: "old-tenant",
            authType: "basic",
            tokenEndpoint: "https://old-idp/token",
            audience: "old-audience",
        } as const;
        host.deploymentState.seed(storedConnection);
        host.deploymentState.failSaves(
            (patch) => patch.authType !== undefined,
            new Error("state locked"),
        );

        const result = await deployAdHoc(
            service,
            buildConfig({
                endpoint: "https://new.example/api",
                tenantId: "new-tenant",
                auth: new OAuth2Auth("cid", "csecret", "https://new-idp/token", "new-audience"),
            }),
        );

        expect(result.message).toBe("ok Not saved: connection settings (state locked).");
        expect(host.deploymentState.load()).toMatchObject(storedConnection);
    });

    it("reports an engine-accepted deploy as deployed and still records it when storing the credentials throws", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));
        vi.spyOn(host.secrets, "saveBasicAuth").mockRejectedValue(new Error("no OS keyring"));

        const result = await deployAdHoc(
            service,
            buildConfig({
                endpoint: "https://c.example/api",
                tenantId: "acme",
                auth: new BasicAuth("admin", "secret"),
            }),
        );

        expect(result).toEqual(
            new DeploymentResult(true, "ok Not saved: credentials (no OS keyring).", "dep-1"),
        );
        expect(host.deploymentState.load().endpoint).toBe("https://c.example/api");
        expect(host.deploymentState.load().ledger).toEqual({
            "adhoc:c.example/acme::/work/order-process.bpmn": recordedRevision("dep-1"),
        });
        expect(host.notifier.logged("warning")).toEqual([
            "Deployment succeeded, but saving its credentials failed: no OS keyring",
        ]);
    });

    it("reports an engine-accepted deploy as deployed when recording the ledger row throws", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));
        host.deploymentState.failSaves(
            (patch) => patch.ledger !== undefined,
            new Error("workspace state unavailable"),
        );

        const result = await service.deploy(
            buildConfig({ auth: new BasicAuth("admin", "secret") }),
            named(targetAt("http://localhost:8080/engine-rest")),
        );

        expect(result).toEqual(
            new DeploymentResult(
                true,
                "ok Not saved: deployment status (workspace state unavailable).",
                "dep-1",
            ),
        );
        await expect(host.secrets.getBasicAuth(TARGET_SLOT)).resolves.toEqual({
            username: "admin",
            password: "secret",
        });
        expect(host.notifier.logged("warning")).toEqual([
            "Deployment succeeded, but saving its deployment status failed: workspace state unavailable",
        ]);
    });

    it("logs the resolved endpoint host as a breadcrumb, never its credentials or path", async () => {
        const { service, host, restClient } = createService({
            files: MAIN_FILE,
            dotEnvFiles: {
                "/work": {
                    MIRAGON_URL: "https://admin:s3cret@camunda.prod.example:8443/engine-rest",
                },
            },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deployAdHoc(service, buildConfig({ endpoint: "${env:MIRAGON_URL}", engine: "c8" }));

        expect(host.notifier.logged("info")).toContain(
            "Deployment started: order-process.bpmn -> c8 @ camunda.prod.example:8443",
        );
        expect(host.notifier.logged("info").join("\n")).not.toMatch(
            /admin|s3cret|engine-rest|\$\{env:/,
        );
    });

    it("logs the deploy override's host as the breadcrumb when one is set", async () => {
        const { service, host, restClient } = createService({ files: MAIN_FILE });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deployAdHoc(
            service,
            buildConfig({
                endpoint: "https://camunda.example/api",
                deployUrl: "https://gateway.example/deploy",
            }),
        );

        expect(host.notifier.logged("info")).toContain(
            "Deployment started: order-process.bpmn -> c7 @ gateway.example",
        );
    });

    it("resolves prefixed refs for the REST request but persists the literal refs", async () => {
        const { service, host, restClient } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_STAGE: "prod", MIRAGON_PASSWORD: "s3cret" } },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await deployAdHoc(
            service,
            buildConfig({
                endpoint: "https://camunda.${env:MIRAGON_STAGE}.example/api",
                auth: new BasicAuth("admin", "${env:MIRAGON_PASSWORD}"),
            }),
        );

        const sentConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect(sentConfig.endpoint).toBe("https://camunda.prod.example/api");
        expect((sentConfig.auth as BasicAuth).password).toBe("s3cret");
        // Persisted state must keep the literal ref, never the resolved secret.
        expect(host.deploymentState.load().endpoint).toBe(
            "https://camunda.${env:MIRAGON_STAGE}.example/api",
        );
        expect(host.deploymentState.load().tenantId).toBe("");
        await expect(host.secrets.getBasicAuth()).resolves.toEqual({
            username: "admin",
            password: "${env:MIRAGON_PASSWORD}",
        });
    });

    it("returns a failed result naming the variable when a referenced variable is unset", async () => {
        const { service, restClient, deploymentStatus } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_OTHER: "x" } },
        });

        const result = await deployAdHoc(
            service,
            buildConfig({ auth: new BasicAuth("admin", "${env:MIRAGON_MISSING}") }),
        );

        expect(result.success).toBe(false);
        // The .env path is the remedy: it tells the user where to define the variable.
        expect(result.message).toBe(
            new UnresolvedEnvVariableError("MIRAGON_MISSING", "auth.password", "/work/.env")
                .message,
        );
        expect(restClient.deploy).not.toHaveBeenCalled();
        expect(deploymentStatus.recordDeployment).not.toHaveBeenCalled();
    });

    it("refuses a reference to a variable outside the modeler prefix before calling the engine", async () => {
        const { service, host, restClient } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { GITHUB_TOKEN: "ghp_leak" } },
        });

        const result = await deployAdHoc(
            service,
            buildConfig({ auth: new BasicAuth("admin", "${env:GITHUB_TOKEN}") }),
        );

        expect(result.success).toBe(false);
        expect(result.message).toBe(
            new DisallowedEnvReferenceError("auth.password", ENV_VARIABLE_PREFIX).message,
        );
        expect(result.message).not.toContain("ghp_leak");
        expect(restClient.deploy).not.toHaveBeenCalled();
        expect(host.notifier.logged("info")).toEqual([]);
    });

    it("rejects an endpoint whose variable is set to an empty value before calling the engine", async () => {
        const { service, restClient, deploymentStatus } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_URL: "" } },
        });

        const result = await deployAdHoc(service, buildConfig({ endpoint: "${env:MIRAGON_URL}" }));

        expect(result.success).toBe(false);
        expect(result.message).toBe(new InvalidDeploymentConfigError(["endpoint"]).message);
        expect(restClient.deploy).not.toHaveBeenCalled();
        expect(deploymentStatus.recordDeployment).not.toHaveBeenCalled();
    });

    it("posts to the convention deploy route when the override's variable is set to an empty value", async () => {
        const fetchStub = stubFetch(
            async () => new Response(JSON.stringify({ id: "dep-1" }), { status: 200 }),
        );
        const { service, host } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_DEPLOY: "" } },
            engineClient: createRealRestClient(),
        });

        const result = await deployAdHoc(
            service,
            buildConfig({
                endpoint: "https://camunda.example/engine-rest",
                deployUrl: "${env:MIRAGON_DEPLOY}",
            }),
        );

        expect(result).toMatchObject({ success: true, deploymentId: "dep-1" });
        expect(fetchStub).toHaveBeenCalledExactlyOnceWith(
            "https://camunda.example/engine-rest/deployment/create",
            expect.anything(),
        );
        expect(host.notifier.logged("info")).toContain(
            "Deployment started: order-process.bpmn -> c7 @ camunda.example",
        );
    });

    it("keeps credentials embedded in a resolved endpoint out of the result and every log when the request fails", async () => {
        const fetchStub = rejectCredentialledUrlsLikeUndici();
        const { service, host, deploymentStatus } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_URL: CREDENTIALLED_ENDPOINT } },
            engineClient: createRealRestClient(),
        });

        const result = await deployAdHoc(service, buildConfig({ endpoint: "${env:MIRAGON_URL}" }));

        // The rejection really quoted the secret, so its absence below is the redaction.
        expect(fetchStub).toHaveBeenCalledExactlyOnceWith(
            `${CREDENTIALLED_ENDPOINT}/deployment/create`,
            expect.anything(),
        );
        expect(result.success).toBe(false);
        expect(result.message).toBe(CREDENTIALLED_URL_REJECTED.message);
        expect(host.notifier.loggedErrors).toEqual([
            expect.objectContaining({
                host: CREDENTIALLED_URL_REJECTED.host,
                reason: CREDENTIALLED_URL_REJECTED.reason,
            }),
        ]);
        expect(host.notifier.loggedErrors[0]).toBeInstanceOf(HttpTransportError);
        expect(host.notifier.logged("error")).toEqual([
            expect.stringContaining(`HttpTransportError: ${CREDENTIALLED_URL_REJECTED.message}\n`),
        ]);
        expect(result.message).not.toContain("s3cret");
        expect(host.notifier.transcript()).not.toContain("s3cret");
        expect(deploymentStatus.recordDeployment).not.toHaveBeenCalled();
    });

    it("masks a resolved .env value and a literal password in the result and every log when the engine quotes the request", async () => {
        const fetchStub = refuseQuotingRequest();
        const { service, host } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_TOKEN: ENV_TOKEN } },
            engineClient: createRealRestClient(),
        });

        const result = await service.deploy(
            buildConfig({
                deployUrl: "https://gw.example/hooks/${env:MIRAGON_TOKEN}/deploy",
                auth: new BasicAuth("admin", LITERAL_PASSWORD),
            }),
            named(targetAt("http://localhost:8080/engine-rest")),
        );

        expect(fetchStub).toHaveBeenCalledExactlyOnceWith(
            `https://gw.example/hooks/${ENV_TOKEN}/deploy`,
            expect.anything(),
        );
        expect(result.success).toBe(false);
        expect(result.message).toBe(
            "Deployment failed with HTTP 403: Gateway refused https://gw.example/hooks/***/deploy for ***:***",
        );
        for (const secret of [ENV_TOKEN, LITERAL_PASSWORD]) {
            expect(result.message).not.toContain(secret);
            expect(host.notifier.transcript()).not.toContain(secret);
        }
    });

    it("hands the config to the env resolver and never reads .env when nothing references it", async () => {
        const { service, restClient, dotEnvReads } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": new Error("EISDIR: illegal operation on a directory, read") },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
        const config = buildConfig({ auth: new BasicAuth("admin", "secret") });

        const result = await deployAdHoc(service, config);

        expect(result.success).toBe(true);
        expect(restClient.deploy).toHaveBeenCalledExactlyOnceWith(config, expect.any(Map));
        expect(dotEnvReads()).toEqual([]);
    });

    it("never reads .env for a named target whose only ref is outside the deploy request", async () => {
        const startUrlRefTarget = new DeploymentTarget(
            "dev",
            "c7",
            "http://localhost:8080/engine-rest",
            "",
            "none",
            "",
            "",
            undefined,
            "${env:MIRAGON_START_URL}",
        );
        const { service, restClient, deploymentStatus, dotEnvReads } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": new Error("EISDIR: illegal operation on a directory, read") },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        const result = await service.deploy(buildConfig(), named(startUrlRefTarget));

        expect(result.success).toBe(true);
        expect(dotEnvReads()).toEqual([]);
        expect(deploymentStatus.recordDeployment.mock.calls[0][2].key()).toBe(
            "target:dev@localhost:8080",
        );
    });
});

describe("DeploymentService.deploy .env scope", () => {
    const NESTED_MAIN_FILE = "/work/team/order-process.bpmn";

    /** Workspace folder `/work` holding a nested project `/work/team` with its own targets file. */
    function createNestedProjectService() {
        const context = createService({
            folders: ["/work"],
            files: xmlFiles(NESTED_MAIN_FILE),
            dotEnvFiles: {
                "/work": { MIRAGON_URL: "https://workspace.example/api" },
                "/work/team": { MIRAGON_URL: "https://team.example/api" },
            },
        });
        context.restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
        return context;
    }

    it("resolves an ad-hoc deploy from the workspace folder's .env, never a nested targets file's", async () => {
        const { service, restClient, dotEnvReads } = createNestedProjectService();

        await deployAdHoc(
            service,
            buildConfig({ endpoint: "${env:MIRAGON_URL}", mainFilePath: NESTED_MAIN_FILE }),
        );

        const sentConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect(sentConfig.endpoint).toBe("https://workspace.example/api");
        expect(dotEnvReads()).toEqual(["/work/.env"]);
    });

    it("resolves a named target's deploy from the .env beside its targets file", async () => {
        const { service, restClient, deploymentStatus, dotEnvReads } = createNestedProjectService();

        await service.deploy(
            buildConfig({ endpoint: "${env:MIRAGON_URL}", mainFilePath: NESTED_MAIN_FILE }),
            named(targetAt("${env:MIRAGON_URL}"), "/work/team"),
        );

        const sentConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect(sentConfig.endpoint).toBe("https://team.example/api");
        expect(dotEnvReads()).toEqual(["/work/team/.env"]);
        expect(deploymentStatus.recordDeployment.mock.calls[0][2].key()).toBe(
            `target:dev@env:${contentFingerprint("team.example")}`,
        );
    });
});

describe("DeploymentService.deploy credential approval", () => {
    it("asks to approve the origin a named target's endpoint resolves to before deploying", async () => {
        const envTarget = targetAt("${env:MIRAGON_URL}");
        const { service, host, restClient } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_URL: "https://prod.example.com:8443/engine-rest" } },
        });
        const approvedAtDeploy = approvalsAtEachDeploy({ host, restClient }, TARGET_SLOT);

        await service.deploy(
            buildConfig({
                endpoint: "${env:MIRAGON_URL}",
                auth: new BasicAuth("admin", "s3cret"),
            }),
            named(envTarget),
        );

        expect(host.picker.prompts).toEqual([
            approvalPrompt("https://prod.example.com:8443", 'target "dev"'),
        ]);
        expect(approvedAtDeploy).toEqual([["https://prod.example.com:8443"]]);
    });

    it("deploys, persists and records nothing when the user declines the destination", async () => {
        const { service, host, restClient, deploymentStatus } = createService({
            files: MAIN_FILE,
            promptAnswers: { credentialApproval: false },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));

        const result = await service.deploy(
            buildConfig({
                endpoint: "https://moved.example/engine-rest",
                auth: new BasicAuth("admin", "s3cret"),
            }),
            named(targetAt("https://moved.example/engine-rest")),
        );

        expect(result).toMatchObject({ success: false, message: DECLINED.message });
        expect(restClient.deploy).not.toHaveBeenCalled();
        await expect(host.secrets.getBasicAuth(TARGET_SLOT)).resolves.toBeUndefined();
        await expect(host.secrets.getOAuth2(TARGET_SLOT)).resolves.toBeUndefined();
        await expect(host.secrets.getBasicAuth()).resolves.toBeUndefined();
        expect(host.deploymentState.load().endpoint).toBe("");
        expect(host.deploymentState.load().authType).toBe("none");
        expect(deploymentStatus.recordDeployment).not.toHaveBeenCalled();
    });

    it("never asks on an ad-hoc deploy whose values are all typed, even beside a .env", async () => {
        const { service, host, restClient } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_URL: "https://from-env.example/engine-rest" } },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        const result = await deployAdHoc(
            service,
            buildConfig({
                endpoint: "https://typed.example/engine-rest",
                auth: new BasicAuth("admin", "s3cret"),
            }),
        );

        expect(result.success).toBe(true);
        expect(host.picker.prompts).toEqual([]);
        await expect(host.secrets.getApprovedDestinations(AD_HOC_SLOT)).resolves.toEqual([]);
    });

    it.each([
        [
            "its endpoint",
            { MIRAGON_URL: "https://from-env.example:8443/engine-rest" },
            buildConfig({ endpoint: "${env:MIRAGON_URL}" }),
            "https://from-env.example:8443",
        ],
        [
            "its password",
            { MIRAGON_PW: "s3cret" },
            buildConfig({
                endpoint: "https://typed.example/engine-rest",
                auth: new BasicAuth("admin", "${env:MIRAGON_PW}"),
            }),
            "https://typed.example",
        ],
    ])(
        "asks under the ad-hoc approvals before an ad-hoc deploy takes %s from .env",
        async (_field, dotEnv, config, origin) => {
            const { service, host, restClient } = createService({
                files: MAIN_FILE,
                dotEnvFiles: { "/work": dotEnv },
            });
            const approvedAtDeploy = approvalsAtEachDeploy({ host, restClient }, AD_HOC_SLOT);

            await deployAdHoc(service, config);

            expect(host.picker.prompts).toEqual([approvalPrompt(origin, "the ad-hoc connection")]);
            expect(approvedAtDeploy).toEqual([[origin]]);
        },
    );

    it("deploys, persists and records nothing when the user declines an ad-hoc endpoint from .env", async () => {
        const declinedAdHoc = new CredentialDestinationNotApprovedError("ad-hoc");
        const { service, host, restClient, deploymentStatus } = createService({
            files: MAIN_FILE,
            dotEnvFiles: { "/work": { MIRAGON_URL: "https://from-env.example/engine-rest" } },
            promptAnswers: { credentialApproval: false },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));

        const result = await deployAdHoc(
            service,
            buildConfig({
                endpoint: "${env:MIRAGON_URL}",
                auth: new BasicAuth("admin", "s3cret"),
            }),
        );

        expect(result).toMatchObject({ success: false, message: declinedAdHoc.message });
        expect(restClient.deploy).not.toHaveBeenCalled();
        await expect(host.secrets.getBasicAuth()).resolves.toBeUndefined();
        expect(host.deploymentState.load().endpoint).toBe("");
        expect(deploymentStatus.recordDeployment).not.toHaveBeenCalled();
    });
});

describe("DeploymentService.deployFiles", () => {
    const target = new DeploymentTarget(
        "dev",
        "c7",
        "https://c/api",
        "acme",
        "none",
        "",
        "",
        "https://gw/deploy",
    );
    const envTarget = targetAt("${env:MIRAGON_URL}");

    it("deploys each file named by basename and reports a full-success summary", async () => {
        const { service, host, restClient } = createService({
            files: { "/work/a.bpmn": "<xml/>", "/work/b.dmn": "<xml/>" },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.dmn"],
            named(target),
            new NoAuth(),
            "/work",
        );

        expect(results).toHaveLength(2);
        expect(results.every((r) => r.success)).toBe(true);
        const firstConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect(firstConfig.deploymentName).toBe("a");
        expect(firstConfig.endpoint).toBe("https://c/api");
        expect(firstConfig.deployUrl).toBe("https://gw/deploy");
        expect(host.notifier.infos).toEqual(['Deployed 2/2 file(s) to "dev".']);
    });

    it("continues after a per-file failure, appends the first failure to the summary and records only the deployed file", async () => {
        const { service, host, restClient } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn", "/work/c.bpmn"),
        });
        restClient.deploy
            .mockResolvedValueOnce(new DeploymentResult(true, "ok", "dep-a"))
            .mockRejectedValueOnce(new Error("boom"))
            .mockRejectedValueOnce(new Error("bang"));

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn", "/work/c.bpmn"],
            named(target),
            new NoAuth(),
            "/work",
        );

        expect(results.map((r) => r.success)).toEqual([true, false, false]);
        expect(results[1].message).toBe("b: boom");
        expect(host.notifier.errors).toEqual(['Deployed 1/3 file(s) to "dev". b: boom']);
        expect(host.deploymentState.load().ledger).toEqual({
            "target:dev@c::/work/a.bpmn": recordedRevision("dep-a"),
        });
    });

    it("records no ledger row for a file the engine rejected", async () => {
        const { service, host, restClient } = createService({ files: xmlFiles("/work/a.bpmn") });
        restClient.deploy.mockResolvedValue(new DeploymentResult(false, "rejected by server"));

        const results = await service.deployFiles(
            ["/work/a.bpmn"],
            named(target),
            new NoAuth(),
            "/work",
        );

        expect(results).toEqual([new DeploymentResult(false, "rejected by server")]);
        expect(host.deploymentState.load().ledger).toEqual({});
        expect(host.notifier.errors).toEqual(['Deployed 0/1 file(s) to "dev". rejected by server']);
    });

    it("counts a file the engine accepted as deployed when recording its ledger row throws", async () => {
        const { service, host, restClient } = createService({ files: xmlFiles("/work/a.bpmn") });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));
        host.deploymentState.failSaves(
            (patch) => patch.ledger !== undefined,
            new Error("workspace state unavailable"),
        );

        const results = await service.deployFiles(
            ["/work/a.bpmn"],
            named(target),
            new NoAuth(),
            "/work",
        );

        expect(results).toEqual([
            new DeploymentResult(
                true,
                "ok Not saved: deployment status (workspace state unavailable).",
                "dep-1",
            ),
        ]);
        expect(host.notifier.infos).toEqual(['Deployed 1/1 file(s) to "dev".']);
        expect(host.notifier.errors).toEqual([]);
    });

    it("never throws: an unreadable .env fails every file that references it and names the .env in the summary", async () => {
        const { service, host, restClient, dotEnvReads } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn"),
            dotEnvFiles: { "/work": new Error("EACCES: permission denied") },
        });

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn"],
            named(envTarget),
            new NoAuth(),
            "/work",
        );

        const unreadable = new UnreadableDotEnvError("/work/.env", "EACCES: permission denied");
        expect(results.map((r) => r.success)).toEqual([false, false]);
        expect(results.map((r) => r.message)).toEqual([
            `a: ${unreadable.message}`,
            `b: ${unreadable.message}`,
        ]);
        expect(dotEnvReads()).toEqual(["/work/.env"]);
        expect(restClient.deploy).not.toHaveBeenCalled();
        expect(host.notifier.errors).toEqual([
            `Deployed 0/2 file(s) to "dev". a: ${unreadable.message}`,
        ]);
        expect(host.notifier.errors[0]).toContain("/work/.env");
    });

    it("ignores an unreadable .env when neither the target nor the auth references a variable", async () => {
        const { service, host, restClient, dotEnvReads } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn"),
            dotEnvFiles: { "/work": new Error("EISDIR: illegal operation on a directory, read") },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn"],
            named(target),
            new BasicAuth("admin", "secret"),
            "/work",
        );

        expect(results.map((r) => r.success)).toEqual([true, true]);
        expect(dotEnvReads()).toEqual([]);
        expect(host.notifier.infos).toEqual(['Deployed 2/2 file(s) to "dev".']);
    });

    it.each<[string, DeploymentTarget, NoAuth | BasicAuth]>([
        [
            "its start-instance URL",
            new DeploymentTarget(
                "dev",
                "c7",
                "https://c/api",
                "",
                "none",
                "",
                "",
                undefined,
                "${env:MIRAGON_START_URL}/{processDefinitionKey}/start",
            ),
            new NoAuth(),
        ],
        [
            "the token endpoint left on a basic-auth target",
            new DeploymentTarget(
                "dev",
                "c7",
                "https://c/api",
                "",
                "basic",
                "${env:MIRAGON_IDP}",
                "",
            ),
            new BasicAuth("admin", "secret"),
        ],
    ])(
        "deploys a target whose only ref is in %s without reading even a broken .env",
        async (_location, refOutsideDeployTarget, auth) => {
            const { service, host, restClient, dotEnvReads } = createService({
                files: xmlFiles("/work/a.bpmn", "/work/b.bpmn"),
                dotEnvFiles: {
                    "/work": new Error("EISDIR: illegal operation on a directory, read"),
                },
            });
            restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

            const results = await service.deployFiles(
                ["/work/a.bpmn", "/work/b.bpmn"],
                named(refOutsideDeployTarget),
                auth,
                "/work",
            );

            expect(results.map((r) => r.success)).toEqual([true, true]);
            expect(dotEnvReads()).toEqual([]);
            expect(host.notifier.errors).toEqual([]);
            expect(host.notifier.infos).toEqual(['Deployed 2/2 file(s) to "dev".']);
        },
    );

    it("resolves env refs in the target's connection fields for every file", async () => {
        const refTarget = targetAt("${env:MIRAGON_URL}", "${env:MIRAGON_TENANT}");
        const { service, restClient, deploymentStatus } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn"),
            dotEnvFiles: {
                "/work": { MIRAGON_URL: "https://prod.example.com/api", MIRAGON_TENANT: "acme" },
            },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn"],
            named(refTarget),
            new NoAuth(),
            "/work",
        );

        const sentConfigs = restClient.deploy.mock.calls.map((call) => call[0] as DeploymentConfig);
        expect(sentConfigs.map((config) => config.endpoint)).toEqual([
            "https://prod.example.com/api",
            "https://prod.example.com/api",
        ]);
        expect(sentConfigs[0].tenantId).toBe("acme");
        expect(deploymentStatus.recordDeployment.mock.calls[0][2].key()).toBe(
            `target:dev@env:${contentFingerprint("prod.example.com")}`,
        );
    });

    it("reads .env once to resolve a credential ref of a literal target for every file", async () => {
        const literalTarget = new DeploymentTarget(
            "dev",
            "c7",
            "https://c/api",
            "",
            "basic",
            "",
            "",
        );
        const auth = new BasicAuth("admin", "${env:MIRAGON_PW}");
        const { service, host, restClient, dotEnvReads } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn"),
            dotEnvFiles: { "/work": { MIRAGON_PW: "s3cret" } },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn"],
            named(literalTarget),
            auth,
            "/work",
        );
        expect(dotEnvReads()).toEqual(["/work/.env"]);
        const sentAuths = restClient.deploy.mock.calls.map(
            (call) => (call[0] as DeploymentConfig).auth,
        );
        expect(sentAuths).toEqual([
            expect.objectContaining({ username: "admin", password: "s3cret" }),
            expect.objectContaining({ username: "admin", password: "s3cret" }),
        ]);
        await expect(host.secrets.getBasicAuth()).resolves.toBeUndefined();
        await expect(host.secrets.getBasicAuth(TARGET_SLOT)).resolves.toBeUndefined();
    });

    it("expands every file with the target project's .env, never the .env of the file's own folder", async () => {
        const { service, restClient, deploymentStatus, dotEnvReads } = createService({
            files: xmlFiles("/team-a/a.bpmn", "/team-b/b.bpmn"),
            dotEnvFiles: {
                "/team-a": { MIRAGON_URL: "https://a.example/api" },
                "/team-b": { MIRAGON_URL: "https://b.example/api" },
            },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));
        const auth = new NoAuth();

        await service.deployFiles(
            ["/team-a/a.bpmn", "/team-b/b.bpmn"],
            named(envTarget, "/team-a"),
            auth,
            "/team-a",
        );
        expect(dotEnvReads()).toEqual(["/team-a/.env"]);
        const sentConfigs = restClient.deploy.mock.calls.map((call) => call[0] as DeploymentConfig);
        expect(sentConfigs.map((config) => config.endpoint)).toEqual([
            "https://a.example/api",
            "https://a.example/api",
        ]);
        const recordedKeys = deploymentStatus.recordDeployment.mock.calls.map((call) =>
            call[2].key(),
        );
        const teamAKey = `target:dev@env:${contentFingerprint("a.example")}`;
        expect(recordedKeys).toEqual([teamAKey, teamAKey]);
    });

    it("is unaffected by an unreadable .env in another file's folder", async () => {
        const { service, host, restClient } = createService({
            files: xmlFiles("/team-a/a.bpmn", "/team-b/b.bpmn"),
            dotEnvFiles: {
                "/team-a": { MIRAGON_URL: "https://a.example/api" },
                "/team-b": new Error("EACCES: permission denied"),
            },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        const results = await service.deployFiles(
            ["/team-a/a.bpmn", "/team-b/b.bpmn"],
            named(envTarget, "/team-a"),
            new NoAuth(),
            "/team-a",
        );

        expect(results.map((r) => r.success)).toEqual([true, true]);
        expect(restClient.deploy).toHaveBeenCalledTimes(2);
        expect(host.notifier.infos).toEqual(['Deployed 2/2 file(s) to "dev".']);
    });

    it("keeps credentials embedded in a resolved endpoint out of every result, log and the summary when requests fail", async () => {
        const fetchStub = rejectCredentialledUrlsLikeUndici();
        const { service, host } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn"),
            dotEnvFiles: { "/work": { MIRAGON_URL: CREDENTIALLED_ENDPOINT } },
            engineClient: createRealRestClient(),
        });

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn"],
            named(envTarget),
            new NoAuth(),
            "/work",
        );

        // The rejections really quoted the secret, so its absence below is the redaction.
        expect(fetchStub).toHaveBeenCalledTimes(2);
        expect(fetchStub).toHaveBeenCalledWith(
            `${CREDENTIALLED_ENDPOINT}/deployment/create`,
            expect.anything(),
        );
        expect(results.map((r) => r.message)).toEqual([
            `a: ${CREDENTIALLED_URL_REJECTED.message}`,
            `b: ${CREDENTIALLED_URL_REJECTED.message}`,
        ]);
        expect(host.notifier.logged("warning")).toHaveLength(2);
        expect(host.notifier.errors).toEqual([
            `Deployed 0/2 file(s) to "dev". a: ${CREDENTIALLED_URL_REJECTED.message}`,
        ]);
        expect(results.map((r) => r.message).join("\n")).not.toContain("s3cret");
        expect(host.notifier.transcript()).not.toContain("s3cret");
    });

    it("masks a resolved .env value and a literal password in every result, log and the summary when the engine quotes the request", async () => {
        const tokenTarget = new DeploymentTarget(
            "dev",
            "c7",
            "https://c/api",
            "",
            "basic",
            "",
            "",
            "https://gw.example/hooks/${env:MIRAGON_TOKEN}/deploy",
        );
        const fetchStub = refuseQuotingRequest();
        const { service, host } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn"),
            dotEnvFiles: { "/work": { MIRAGON_TOKEN: ENV_TOKEN } },
            engineClient: createRealRestClient(),
        });

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn"],
            named(tokenTarget),
            new BasicAuth("admin", LITERAL_PASSWORD),
            "/work",
        );

        expect(fetchStub).toHaveBeenCalledTimes(2);
        expect(fetchStub).toHaveBeenCalledWith(
            `https://gw.example/hooks/${ENV_TOKEN}/deploy`,
            expect.anything(),
        );
        const refusal =
            "Deployment failed with HTTP 403: Gateway refused https://gw.example/hooks/***/deploy for ***:***";
        expect(results.map((r) => r.message)).toEqual([`a: ${refusal}`, `b: ${refusal}`]);
        expect(host.notifier.errors).toEqual([`Deployed 0/2 file(s) to "dev". a: ${refusal}`]);
        for (const secret of [ENV_TOKEN, LITERAL_PASSWORD]) {
            expect(results.map((r) => r.message).join("\n")).not.toContain(secret);
            expect(host.notifier.transcript()).not.toContain(secret);
        }
    });

    it("asks once for the whole batch, for the origin the target resolves to, before the first deploy", async () => {
        const { service, host, restClient } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn", "/work/c.bpmn"),
            dotEnvFiles: { "/work": { MIRAGON_URL: "https://prod.example.com/api" } },
        });
        const approvedAtDeploy = approvalsAtEachDeploy({ host, restClient }, TARGET_SLOT);

        await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn", "/work/c.bpmn"],
            named(envTarget),
            new BasicAuth("admin", "s3cret"),
            "/work",
        );

        expect(host.picker.prompts).toEqual([
            approvalPrompt("https://prod.example.com", 'target "dev"'),
        ]);
        expect(approvedAtDeploy).toEqual([
            ["https://prod.example.com"],
            ["https://prod.example.com"],
            ["https://prod.example.com"],
        ]);
    });

    it("fails every file without a single deploy when the user declines the destination", async () => {
        const { service, host, restClient, deploymentStatus } = createService({
            files: xmlFiles("/work/a.bpmn", "/work/b.bpmn"),
            promptAnswers: { credentialApproval: false },
        });
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn"],
            named(target),
            new BasicAuth("admin", "s3cret"),
            "/work",
        );

        expect(results.map((r) => [r.success, r.message])).toEqual([
            [false, `a: ${DECLINED.message}`],
            [false, `b: ${DECLINED.message}`],
        ]);
        expect(host.picker.prompts).toEqual([approvalPrompt("https://gw", 'target "dev"')]);
        await expect(host.secrets.getApprovedDestinations(TARGET_SLOT)).resolves.toEqual([]);
        expect(restClient.deploy).not.toHaveBeenCalled();
        expect(deploymentStatus.recordDeployment).not.toHaveBeenCalled();
        expect(host.notifier.errors).toEqual([
            `Deployed 0/2 file(s) to "dev". a: ${DECLINED.message}`,
        ]);
    });
});
