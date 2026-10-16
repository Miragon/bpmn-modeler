import { beforeEach, describe, expect, it, vi } from "vitest";

import { EngineInspectionFailedError, FileNotFound } from "../../shared/domain/errors";
import { BasicAuth, NoAuth } from "../domain/deployment";
import { contentFingerprint, DeploymentTargetIdentity } from "../domain/deploymentLedger";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { EngineDeploymentSnapshot } from "../domain/deploymentVerification";
import { DeploymentVerificationService } from "./DeploymentVerificationService";
import { EnvValueResolver } from "./EnvValueResolver";

function createEnvResolver(
    dotEnv: Record<string, string> = {},
    processEnv: Record<string, string> = {},
): EnvValueResolver {
    const artifactService = { getWorkspaceRoot: vi.fn().mockResolvedValue("/work") };
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

const FILE_PATH = "/work/order-process.bpmn";
const XML = '<bpmn:process id="order"/>';

const c7Target = new DeploymentTarget(
    "dev",
    "c7",
    "http://localhost:8080/engine-rest",
    "",
    "none",
    "",
    "",
);
const c8Target = new DeploymentTarget("cloud", "c8", "https://c8.example.com", "", "none", "", "");
const identity = DeploymentTargetIdentity.fromTarget(c7Target, () => undefined);

const snapshot = (overrides: Partial<EngineDeploymentSnapshot> = {}): EngineDeploymentSnapshot => ({
    processDefinitionId: "order:3:def-1",
    deploymentId: "dep-9",
    resourceName: "order.bpmn",
    xml: XML,
    deploymentTime: "2026-09-17T14:40:00.000Z",
    ...overrides,
});

function createService(envResolver: EnvValueResolver = createEnvResolver()) {
    const editorStore = {
        getActiveEditorId: vi.fn().mockReturnValue("editor-1"),
    };
    const documentPort = {
        getFilePath: vi.fn().mockReturnValue(FILE_PATH),
        getContent: vi.fn().mockReturnValue(XML),
    };
    const deploymentTargetService = {
        getActiveTarget: vi.fn().mockResolvedValue(c7Target),
        getCredentials: vi.fn().mockResolvedValue(new NoAuth()),
    };
    const deploymentStatusService = {
        getRevision: vi.fn().mockReturnValue(undefined),
        adoptRevision: vi.fn().mockResolvedValue(undefined),
        forgetRevision: vi.fn().mockResolvedValue(undefined),
        refreshActive: vi.fn().mockResolvedValue(undefined),
    };
    const inspection = {
        fetchLatestDefinition: vi.fn().mockResolvedValue(snapshot()),
    };
    const notifier = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        notifyError: vi.fn(),
        withProgress: vi.fn((_title: string, task: () => Promise<unknown>) => task()),
    };

    const service = new DeploymentVerificationService(
        editorStore as never,
        documentPort as never,
        deploymentTargetService as never,
        deploymentStatusService as never,
        inspection as never,
        notifier as never,
        envResolver,
    );

    return {
        service,
        editorStore,
        documentPort,
        deploymentTargetService,
        deploymentStatusService,
        inspection,
        notifier,
    };
}

beforeEach(() => vi.clearAllMocks());

describe("DeploymentVerificationService.verifyActive", () => {
    it("reports when no diagram is focused", async () => {
        const c = createService();
        c.editorStore.getActiveEditorId.mockImplementation(() => {
            throw new Error("no active editor");
        });

        await c.service.verifyActive();

        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            "Open a BPMN diagram to verify its deployment.",
        );
        expect(c.inspection.fetchLatestDefinition).not.toHaveBeenCalled();
    });

    it("reports when no named target is active", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(undefined);

        await c.service.verifyActive("/work");

        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            "Select a named Camunda 7 target to verify against.",
        );
        expect(c.inspection.fetchLatestDefinition).not.toHaveBeenCalled();
    });

    it("reports that C8 targets cannot be verified", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(c8Target);

        await c.service.verifyActive("/work");

        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            "Verification is not available for Camunda 8 targets.",
        );
        expect(c.inspection.fetchLatestDefinition).not.toHaveBeenCalled();
    });

    it("shows an error when the diagram has no process id", async () => {
        const c = createService();
        c.documentPort.getContent.mockReturnValue("<bpmn:definitions/>");

        await c.service.verifyActive("/work");

        expect(c.notifier.showError).toHaveBeenCalledOnce();
        expect(c.inspection.fetchLatestDefinition).not.toHaveBeenCalled();
    });

    it("confirms a current deployment and re-stamps verifiedAt", async () => {
        const c = createService();
        const recorded = {
            fingerprint: contentFingerprint(XML),
            deployedAt: "2026-09-17T14:32:00.000Z",
            deploymentId: "dep-9",
            origin: "local" as const,
        };
        c.deploymentStatusService.getRevision.mockReturnValue(recorded);

        await c.service.verifyActive("/work");

        expect(c.inspection.fetchLatestDefinition).toHaveBeenCalledWith({
            endpoint: c7Target.endpoint,
            tenantId: "",
            processKey: "order",
            auth: expect.any(NoAuth),
        });
        expect(c.deploymentStatusService.adoptRevision).toHaveBeenCalledWith(
            FILE_PATH,
            identity,
            expect.objectContaining({ ...recorded, verifiedAt: expect.any(String) }),
        );
        expect(c.deploymentStatusService.refreshActive).toHaveBeenCalled();
        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            expect.stringContaining("dev runs your last deployment"),
        );
    });

    it("adopts an engine revision matching this diagram", async () => {
        const c = createService();

        await c.service.verifyActive("/work");

        expect(c.deploymentStatusService.adoptRevision).toHaveBeenCalledWith(
            FILE_PATH,
            identity,
            expect.objectContaining({ origin: "engine", deploymentId: "dep-9" }),
        );
        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            expect.stringContaining("dev runs exactly this diagram"),
        );
    });

    it("reports a differing engine deployment as information", async () => {
        const c = createService();
        c.inspection.fetchLatestDefinition.mockResolvedValue(snapshot({ xml: "<different/>" }));

        await c.service.verifyActive("/work");

        expect(c.deploymentStatusService.adoptRevision).toHaveBeenCalledWith(
            FILE_PATH,
            identity,
            expect.objectContaining({ origin: "engine" }),
        );
        const deployedTime = new Date("2026-09-17T14:40:00.000Z").toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
        });
        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            `The version deployed on dev (deployed ${deployedTime}) differs from your diagram.`,
        );
        expect(c.notifier.showError).not.toHaveBeenCalled();
    });

    it("omits the deployment time when it is unavailable", async () => {
        const c = createService();
        c.inspection.fetchLatestDefinition.mockResolvedValue(
            snapshot({ xml: "<different/>", deploymentTime: undefined }),
        );

        await c.service.verifyActive("/work");

        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            "The version deployed on dev differs from your diagram.",
        );
        expect(c.notifier.showError).not.toHaveBeenCalled();
    });

    it("forgets the row when the process is not deployed", async () => {
        const c = createService();
        c.inspection.fetchLatestDefinition.mockResolvedValue(undefined);

        await c.service.verifyActive("/work");

        expect(c.deploymentStatusService.forgetRevision).toHaveBeenCalledWith(FILE_PATH, identity);
        expect(c.deploymentStatusService.adoptRevision).not.toHaveBeenCalled();
        expect(c.notifier.showInfo).toHaveBeenCalledWith("Process 'order' is not deployed on dev.");
    });

    it("points at the target credentials on an auth failure, leaving the ledger untouched", async () => {
        const c = createService();
        c.inspection.fetchLatestDefinition.mockRejectedValue(
            new EngineInspectionFailedError(401, "Unauthorized"),
        );

        await c.service.verifyActive("/work");

        expect(c.notifier.showError).toHaveBeenCalledWith(
            'Could not verify deployment on "dev" — check the target credentials.',
        );
        expect(c.deploymentStatusService.adoptRevision).not.toHaveBeenCalled();
        expect(c.deploymentStatusService.forgetRevision).not.toHaveBeenCalled();
    });

    it("routes other failures through notifyError, leaving the ledger untouched", async () => {
        const c = createService();
        c.inspection.fetchLatestDefinition.mockRejectedValue(new Error("connection refused"));

        await c.service.verifyActive("/work");

        expect(c.notifier.notifyError).toHaveBeenCalledWith(
            "Could not verify deployment",
            expect.any(Error),
        );
        expect(c.deploymentStatusService.adoptRevision).not.toHaveBeenCalled();
        expect(c.deploymentStatusService.forgetRevision).not.toHaveBeenCalled();
    });

    it("runs the lookup inside a progress bracket naming the target", async () => {
        const c = createService();

        await c.service.verifyActive("/work");

        expect(c.notifier.withProgress).toHaveBeenCalledWith(
            'Verifying on "dev"…',
            expect.any(Function),
        );
    });

    it("resolves ${env:VAR} in endpoint and credentials before the lookup", async () => {
        const refTarget = new DeploymentTarget(
            "dev",
            "c7",
            "https://camunda.${env:STAGE}/rest",
            "",
            "basic",
            "",
            "",
        );
        const c = createService(createEnvResolver({ STAGE: "prod", PW: "p@ss" }));
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(refTarget);
        c.deploymentTargetService.getCredentials.mockResolvedValue(
            new BasicAuth("admin", "${env:PW}"),
        );

        await c.service.verifyActive("/work");

        const call = c.inspection.fetchLatestDefinition.mock.calls[0][0];
        expect(call.endpoint).toBe("https://camunda.prod/rest");
        expect((call.auth as BasicAuth).password).toBe("p@ss");
    });

    it("resolves ${env:VAR} in the tenant id before the lookup", async () => {
        const refTarget = new DeploymentTarget(
            "dev",
            "c7",
            "http://localhost:8080/engine-rest",
            "${env:TENANT}",
            "none",
            "",
            "",
        );
        const c = createService(createEnvResolver({ TENANT: "acme" }));
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(refTarget);

        await c.service.verifyActive("/work");

        expect(c.inspection.fetchLatestDefinition.mock.calls[0][0].tenantId).toBe("acme");
    });

    it("shows the env error and skips the lookup when a referenced variable is unset", async () => {
        const c = createService(createEnvResolver());
        c.deploymentTargetService.getCredentials.mockResolvedValue(
            new BasicAuth("admin", "${env:MISSING_PW}"),
        );

        await c.service.verifyActive("/work");

        expect(c.notifier.showError).toHaveBeenCalledWith(expect.stringContaining("MISSING_PW"));
        expect(c.inspection.fetchLatestDefinition).not.toHaveBeenCalled();
    });
});
