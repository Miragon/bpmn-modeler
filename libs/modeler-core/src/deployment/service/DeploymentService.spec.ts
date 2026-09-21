import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    BasicAuth,
    DeploymentConfig,
    DeploymentConfigBuilder,
    DeploymentResult,
    NoAuth,
    OAuth2Auth,
} from "../domain/deployment";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { DeploymentService } from "./DeploymentService";
import { EnvValueResolver } from "./EnvValueResolver";
import { BpmnDocument } from "../../shared/domain/BpmnDocument";
import { FileNotFound } from "../../shared/domain/errors";

/**
 * A real {@link EnvValueResolver} backed by controllable `.env` + process env, so
 * a test can assert what the REST client vs. the secret store see.
 */
function createEnvResolver(
    dotEnv: Record<string, string> = {},
    processEnv: Record<string, string> = {},
): EnvValueResolver {
    const artifactService = {
        getWorkspaceRoot: vi.fn().mockResolvedValue("/work"),
    };
    const workspace = {
        readFile: vi.fn().mockImplementation(async (path: string) => {
            if (path.endsWith(".env")) {
                return Object.entries(dotEnv)
                    .map(([key, value]) => `${key}=${value}`)
                    .join("\n");
            }
            throw new FileNotFound(path);
        }),
        getWorkspaceFolderPaths: vi.fn().mockReturnValue(["/work"]),
    };
    const env = { get: (name: string) => processEnv[name] };
    return new EnvValueResolver(artifactService as never, workspace as never, env as never);
}

// A real, valid C8 document so `detectEngine` exercises the production
// `BpmnDocument.detectPlatform` path instead of a stub.
const C8_XML = BpmnDocument.empty("c8", "8.8.0").xml;

/**
 * Builds the service with fully mocked ports. Each port is a bare `vi.fn()`
 * record cast to the interface — the service only ever calls these methods, so
 * a structural double keeps the test free of any `vscode` surface.
 */
function createService(envResolver: EnvValueResolver = createEnvResolver()) {
    const vsDocument = {
        getFilePath: vi.fn(),
        getContent: vi.fn(),
        write: vi.fn(),
        save: vi.fn(),
    };
    const vsWorkspace = {
        readFile: vi.fn(),
    };
    const deploymentState = {
        getEndpoint: vi.fn().mockReturnValue(""),
        getTenantId: vi.fn().mockReturnValue(""),
        getAuthType: vi.fn().mockReturnValue("none"),
        getTokenEndpoint: vi.fn().mockReturnValue(""),
        getAudience: vi.fn().mockReturnValue(""),
        save: vi.fn().mockResolvedValue(undefined),
        saveAuthType: vi.fn().mockResolvedValue(undefined),
        saveOAuth2Config: vi.fn().mockResolvedValue(undefined),
    };
    const restClient = {
        deploy: vi.fn(),
        startInstance: vi.fn(),
    };
    const notifier = {
        logError: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        showInfo: vi.fn(),
        showError: vi.fn(),
        notifyError: vi.fn(),
    };
    const picker = {
        pickWorkspaceFiles: vi.fn(),
    };
    const secretStore = {
        getBasicAuth: vi.fn(),
        saveBasicAuth: vi.fn().mockResolvedValue(undefined),
        getOAuth2: vi.fn(),
        saveOAuth2: vi.fn().mockResolvedValue(undefined),
    };
    const deploymentStatus = {
        recordDeployment: vi.fn().mockResolvedValue(undefined),
    };

    const service = new DeploymentService(
        vsDocument as never,
        vsWorkspace as never,
        deploymentState as never,
        restClient as never,
        notifier as never,
        picker as never,
        secretStore as never,
        deploymentStatus as never,
        envResolver,
    );

    return {
        service,
        vsDocument,
        vsWorkspace,
        deploymentState,
        restClient,
        notifier,
        picker,
        secretStore,
        deploymentStatus,
    };
}

/** A minimal valid config; callers override only the fields a test cares about. */
function buildConfig(
    overrides: Partial<{
        auth: NoAuth | BasicAuth | OAuth2Auth;
        mainFilePath: string;
        additionalFilePaths: string[];
        endpoint: string;
        tenantId: string;
    }> = {},
): DeploymentConfig {
    return new DeploymentConfigBuilder()
        .withDeploymentName("order-process")
        .withEndpoint(overrides.endpoint ?? "http://localhost:8080/engine-rest")
        .withTenantId(overrides.tenantId ?? "")
        .withMainFilePath(overrides.mainFilePath ?? "/work/order-process.bpmn")
        .withAdditionalFilePaths(overrides.additionalFilePaths ?? [])
        .withAuth(overrides.auth ?? new NoAuth())
        .build();
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("DeploymentService.getFormDefaults", () => {
    it("derives the deployment name from the filename and auto-detects the engine", () => {
        const { service, vsDocument, deploymentState } = createService();
        vsDocument.getFilePath.mockReturnValue("/work/order-process.bpmn");
        vsDocument.getContent.mockReturnValue(C8_XML);
        deploymentState.getEndpoint.mockReturnValue("https://camunda.example/api");
        deploymentState.getTenantId.mockReturnValue("acme");

        const defaults = service.getFormDefaults("editor-1");

        expect(defaults.deploymentName).toBe("order-process");
        expect(defaults.engine).toBe("c8");
        expect(defaults.endpoint).toBe("https://camunda.example/api");
        expect(defaults.tenantId).toBe("acme");
    });

    it("falls back to the c7 engine when platform detection fails", () => {
        const { service, vsDocument } = createService();
        vsDocument.getFilePath.mockReturnValue("/work/order-process.bpmn");
        // No platform markers → detectPlatform throws, caught internally.
        vsDocument.getContent.mockReturnValue("<bpmn:definitions/>");

        const defaults = service.getFormDefaults("editor-1");

        // The name is still derived because it is computed before detection.
        expect(defaults.deploymentName).toBe("order-process");
        expect(defaults.engine).toBe("c7");
    });

    it("uses empty defaults when there is no active editor", () => {
        const { service, vsDocument } = createService();
        vsDocument.getFilePath.mockImplementation(() => {
            throw new Error("no active editor");
        });

        const defaults = service.getFormDefaults("editor-1");

        expect(defaults.deploymentName).toBe("");
        expect(defaults.engine).toBe("c7");
    });

    it("defaults the endpoint to the local engine-rest URL when none is stored", () => {
        const { service, vsDocument } = createService();
        vsDocument.getFilePath.mockReturnValue("/work/p.bpmn");
        vsDocument.getContent.mockReturnValue(C8_XML);

        const defaults = service.getFormDefaults("editor-1");

        expect(defaults.endpoint).toBe("http://localhost:8080/engine-rest");
    });
});

describe("DeploymentService.getStoredCredentials", () => {
    it("returns basic credentials when basic auth is stored", async () => {
        const { service, deploymentState, secretStore } = createService();
        deploymentState.getAuthType.mockReturnValue("basic");
        secretStore.getBasicAuth.mockResolvedValue({ username: "admin", password: "secret" });

        await expect(service.getStoredCredentials()).resolves.toEqual({
            authType: "basic",
            username: "admin",
            password: "secret",
        });
    });

    it("returns oauth2 credentials plus the stored token endpoint and audience", async () => {
        const { service, deploymentState, secretStore } = createService();
        deploymentState.getAuthType.mockReturnValue("oauth2");
        deploymentState.getTokenEndpoint.mockReturnValue("https://idp/token");
        deploymentState.getAudience.mockReturnValue("zeebe-api");
        secretStore.getOAuth2.mockResolvedValue({ clientId: "cid", clientSecret: "csecret" });

        await expect(service.getStoredCredentials()).resolves.toEqual({
            authType: "oauth2",
            clientId: "cid",
            clientSecret: "csecret",
            tokenEndpoint: "https://idp/token",
            audience: "zeebe-api",
        });
    });

    it("returns a none payload when the auth type is basic but no secret exists", async () => {
        const { service, deploymentState, secretStore } = createService();
        deploymentState.getAuthType.mockReturnValue("basic");
        secretStore.getBasicAuth.mockResolvedValue(undefined);

        await expect(service.getStoredCredentials()).resolves.toEqual({ authType: "none" });
    });

    it("returns a none payload when no auth is configured", async () => {
        const { service } = createService();

        await expect(service.getStoredCredentials()).resolves.toEqual({ authType: "none" });
    });
});

describe("DeploymentService.selectAdditionalFiles", () => {
    it("forwards the deployment-resource glob to the picker", async () => {
        const { service, picker } = createService();
        picker.pickWorkspaceFiles.mockResolvedValue(["/work/a.form"]);

        const result = await service.selectAdditionalFiles();

        expect(result).toEqual(["/work/a.form"]);
        expect(picker.pickWorkspaceFiles).toHaveBeenCalledWith({
            glob: "**/*.{form,json,dmn}",
            exclude: "**/element-templates/**",
            placeholder: expect.any(String),
            limit: 20,
        });
    });
});

describe("DeploymentService.deploy", () => {
    it("reads the main and additional files keyed by basename before deploying", async () => {
        const { service, vsWorkspace, restClient } = createService();
        vsWorkspace.readFile.mockImplementation((p: string) => Promise.resolve(`content:${p}`));
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));

        await service.deploy(
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
        const { service, vsWorkspace, restClient, deploymentState } = createService();
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok", "dep-1"));

        await service.deploy(buildConfig({ endpoint: "https://c/api", tenantId: "acme" }));

        expect(deploymentState.save).toHaveBeenCalledWith("https://c/api", "acme");
        expect(deploymentState.saveAuthType).toHaveBeenCalledWith("none");
    });

    it("stores basic-auth credentials on success", async () => {
        const { service, vsWorkspace, restClient, secretStore, deploymentState } = createService();
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await service.deploy(buildConfig({ auth: new BasicAuth("admin", "secret") }));

        expect(deploymentState.saveAuthType).toHaveBeenCalledWith("basic");
        expect(secretStore.saveBasicAuth).toHaveBeenCalledWith("admin", "secret", undefined);
    });

    it("stores oauth2 credentials and config on success", async () => {
        const { service, vsWorkspace, restClient, secretStore, deploymentState } = createService();
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await service.deploy(
            buildConfig({
                auth: new OAuth2Auth("cid", "csecret", "https://idp/token", "zeebe-api"),
            }),
        );

        expect(secretStore.saveOAuth2).toHaveBeenCalledWith("cid", "csecret", undefined);
        expect(deploymentState.saveOAuth2Config).toHaveBeenCalledWith(
            "https://idp/token",
            "zeebe-api",
        );
    });

    it("persists only credentials under the slot (not legacy state) in target mode", async () => {
        const { service, vsWorkspace, restClient, secretStore, deploymentState } = createService();
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await service.deploy(
            buildConfig({ auth: new BasicAuth("admin", "secret") }),
            "/ws/.camunda/deployment-targets.json::dev",
        );

        expect(secretStore.saveBasicAuth).toHaveBeenCalledWith(
            "admin",
            "secret",
            "/ws/.camunda/deployment-targets.json::dev",
        );
        expect(deploymentState.save).not.toHaveBeenCalled();
        expect(deploymentState.saveAuthType).not.toHaveBeenCalled();
    });

    it("passes a failed result through without persisting any state", async () => {
        const { service, vsWorkspace, restClient, deploymentState } = createService();
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy.mockResolvedValue(new DeploymentResult(false, "rejected by server"));

        const result = await service.deploy(buildConfig());

        expect(result.success).toBe(false);
        expect(deploymentState.save).not.toHaveBeenCalled();
    });

    it("never throws: a rejected REST call becomes a failed result and is logged", async () => {
        const { service, vsWorkspace, restClient, notifier } = createService();
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy.mockRejectedValue(new Error("network down"));

        const result = await service.deploy(buildConfig());

        expect(result.success).toBe(false);
        expect(result.message).toBe("network down");
        expect(notifier.logError).toHaveBeenCalledOnce();
    });

    it("never throws: a failed file read becomes a failed result", async () => {
        const { service, vsWorkspace, restClient } = createService();
        vsWorkspace.readFile.mockRejectedValue(new Error("ENOENT"));

        const result = await service.deploy(buildConfig());

        expect(result.success).toBe(false);
        expect(result.message).toBe("ENOENT");
        expect(restClient.deploy).not.toHaveBeenCalled();
    });

    it("resolves ${env:VAR} for the REST request but stores the literal ref", async () => {
        const { service, vsWorkspace, restClient, secretStore } = createService(
            createEnvResolver({ CAMUNDA_PASSWORD: "s3cret" }),
        );
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        await service.deploy(
            buildConfig({ auth: new BasicAuth("admin", "${env:CAMUNDA_PASSWORD}") }),
        );

        const sentConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect((sentConfig.auth as BasicAuth).password).toBe("s3cret");
        // The secret store must keep the literal ref, never the resolved secret.
        expect(secretStore.saveBasicAuth).toHaveBeenCalledWith(
            "admin",
            "${env:CAMUNDA_PASSWORD}",
            undefined,
        );
    });

    it("returns a failed result naming the variable when a ${env:VAR} is unset", async () => {
        const { service, vsWorkspace, restClient } = createService(createEnvResolver());
        vsWorkspace.readFile.mockResolvedValue("<xml/>");

        const result = await service.deploy(
            buildConfig({ auth: new BasicAuth("admin", "${env:MISSING_VAR}") }),
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain("MISSING_VAR");
        expect(restClient.deploy).not.toHaveBeenCalled();
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

    it("deploys each file named by basename and reports a full-success summary", async () => {
        const { service, vsWorkspace, restClient, notifier } = createService();
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy.mockResolvedValue(new DeploymentResult(true, "ok"));

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.dmn"],
            target,
            new NoAuth(),
        );

        expect(results).toHaveLength(2);
        expect(results.every((r) => r.success)).toBe(true);
        const firstConfig = restClient.deploy.mock.calls[0][0] as DeploymentConfig;
        expect(firstConfig.deploymentName).toBe("a");
        expect(firstConfig.endpoint).toBe("https://c/api");
        expect(firstConfig.deployUrl).toBe("https://gw/deploy");
        expect(notifier.showInfo).toHaveBeenCalledWith('Deployed 2/2 file(s) to "dev".');
    });

    it("continues after a per-file failure and reports a partial summary", async () => {
        const { service, vsWorkspace, restClient, notifier } = createService();
        vsWorkspace.readFile.mockResolvedValue("<xml/>");
        restClient.deploy
            .mockResolvedValueOnce(new DeploymentResult(true, "ok"))
            .mockRejectedValueOnce(new Error("boom"));

        const results = await service.deployFiles(
            ["/work/a.bpmn", "/work/b.bpmn"],
            target,
            new NoAuth(),
        );

        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
        expect(results[1].message).toContain("boom");
        expect(notifier.showError).toHaveBeenCalledWith('Deployed 1/2 file(s) to "dev".');
    });
});
