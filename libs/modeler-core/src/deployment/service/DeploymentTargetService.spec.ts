import { beforeEach, describe, expect, it, vi } from "vitest";

import { serializeDeploymentTargets, DeploymentTarget } from "../domain/deploymentTarget";
import { DeploymentTargetService } from "./DeploymentTargetService";

const CONFIG_FOLDER = ".camunda";
const FILE_PATH = `/ws/${CONFIG_FOLDER}/deployment-targets.json`;
const DOC_DIR = "/ws/src";

function fileWith(...targets: DeploymentTarget[]): string {
    return serializeDeploymentTargets(targets);
}

function target(name: string, overrides: Partial<DeploymentTarget> = {}): DeploymentTarget {
    return new DeploymentTarget(
        name,
        overrides.engine ?? "c7",
        overrides.endpoint ?? "http://localhost:8080/engine-rest",
        overrides.tenantId ?? "",
        overrides.authType ?? "none",
        overrides.tokenEndpoint ?? "",
        overrides.audience ?? "",
        overrides.deployUrl,
        overrides.startInstanceUrl,
    );
}

function createService() {
    const artifactService = {
        getWorkspaceRoot: vi.fn().mockResolvedValue("/ws"),
        findConfigFile: vi.fn().mockResolvedValue(undefined),
    };
    const settings = { getConfigFolder: vi.fn().mockReturnValue(CONFIG_FOLDER) };
    const workspace = {
        readFile: vi.fn(),
        writeFile: vi.fn().mockResolvedValue(undefined),
        getWorkspaceFolderPaths: vi.fn().mockReturnValue(["/ws"]),
    };
    const secretStore = {
        saveBasicAuth: vi.fn().mockResolvedValue(undefined),
        getBasicAuth: vi.fn(),
        saveOAuth2: vi.fn().mockResolvedValue(undefined),
        getOAuth2: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const deploymentState = {
        getActiveTargetName: vi.fn().mockReturnValue(""),
        saveActiveTargetName: vi.fn().mockResolvedValue(undefined),
    };
    const statusBar = { showDeploymentTarget: vi.fn() };
    const picker = {
        pickDeploymentTarget: vi.fn(),
        confirmDestructive: vi.fn().mockResolvedValue(true),
    };
    const notifier = { notifyError: vi.fn(), logError: vi.fn() };

    const service = new DeploymentTargetService(
        artifactService as never,
        settings as never,
        workspace as never,
        secretStore as never,
        deploymentState as never,
        statusBar as never,
        picker as never,
        notifier as never,
    );

    return {
        service,
        artifactService,
        workspace,
        secretStore,
        deploymentState,
        statusBar,
        picker,
        notifier,
    };
}

beforeEach(() => vi.clearAllMocks());

describe("DeploymentTargetService.listTargets", () => {
    it("reads and parses the nearest existing file", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue(fileWith(target("dev")));

        const targets = await c.service.listTargets(DOC_DIR);

        expect(c.workspace.readFile).toHaveBeenCalledWith(FILE_PATH);
        expect(targets.map((t) => t.name)).toEqual(["dev"]);
    });

    it("returns [] when no file exists", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(undefined);

        expect(await c.service.listTargets(DOC_DIR)).toEqual([]);
    });

    it("reports a parse error and returns []", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue("{ not valid json");

        expect(await c.service.listTargets(DOC_DIR)).toEqual([]);
        expect(c.notifier.notifyError).toHaveBeenCalledOnce();
    });
});

describe("DeploymentTargetService.saveTarget", () => {
    it("writes the upserted file, stores secrets under the slot, and activates", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue(fileWith(target("prod")));

        await c.service.saveTarget(
            {
                name: "dev",
                engine: "c7",
                endpoint: "http://h",
                tenantId: "",
                authType: "basic",
            },
            { authType: "basic", username: "u", password: "p" },
            undefined,
            DOC_DIR,
        );

        const written = c.workspace.writeFile.mock.calls[0][1] as string;
        expect(written).toContain('"prod"');
        expect(written).toContain('"dev"');
        expect(c.secretStore.saveBasicAuth).toHaveBeenCalledWith("u", "p", `${FILE_PATH}::dev`);
        expect(c.deploymentState.saveActiveTargetName).toHaveBeenCalledWith("dev");
        expect(c.statusBar.showDeploymentTarget).toHaveBeenCalled();
    });

    it("deletes the previous credential slot on rename", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue(fileWith(target("old")));

        await c.service.saveTarget(
            { name: "new", engine: "c7", endpoint: "http://h", tenantId: "", authType: "none" },
            { authType: "none" },
            "old",
            DOC_DIR,
        );

        expect(c.secretStore.delete).toHaveBeenCalledWith(`${FILE_PATH}::old`);
    });

    it("throws when there is no workspace to store the file in", async () => {
        const c = createService();
        c.workspace.getWorkspaceFolderPaths.mockReturnValue([]);

        await expect(
            c.service.saveTarget(
                {
                    name: "dev",
                    engine: "c7",
                    endpoint: "http://h",
                    tenantId: "",
                    authType: "none",
                },
                { authType: "none" },
                undefined,
                undefined,
            ),
        ).rejects.toThrow(/workspace/);
    });
});

describe("DeploymentTargetService.deleteTarget", () => {
    it("removes the target, deletes its slot, and clears the active target", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue(fileWith(target("dev"), target("prod")));
        c.deploymentState.getActiveTargetName.mockReturnValue("dev");

        const deleted = await c.service.deleteTarget("dev", DOC_DIR);

        expect(deleted).toBe(true);
        const written = c.workspace.writeFile.mock.calls[0][1] as string;
        expect(written).not.toContain('"dev"');
        expect(c.secretStore.delete).toHaveBeenCalledWith(`${FILE_PATH}::dev`);
        expect(c.deploymentState.saveActiveTargetName).toHaveBeenCalledWith("");
    });

    it("is a no-op when the user cancels the confirm", async () => {
        const c = createService();
        c.picker.confirmDestructive.mockResolvedValue(false);

        expect(await c.service.deleteTarget("dev", DOC_DIR)).toBe(false);
        expect(c.workspace.writeFile).not.toHaveBeenCalled();
    });
});

describe("DeploymentTargetService.getActiveTarget", () => {
    it("returns undefined for a dangling active name", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue(fileWith(target("dev")));
        c.deploymentState.getActiveTargetName.mockReturnValue("gone");

        expect(await c.service.getActiveTarget(DOC_DIR)).toBeUndefined();
    });
});

describe("DeploymentTargetService.switchActiveTarget", () => {
    it("is a no-op on dismissal", async () => {
        const c = createService();
        c.picker.pickDeploymentTarget.mockResolvedValue(undefined);

        await c.service.switchActiveTarget(DOC_DIR);

        expect(c.deploymentState.saveActiveTargetName).not.toHaveBeenCalled();
    });

    it("persists the picked target and refreshes the status bar", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue(fileWith(target("dev")));
        c.picker.pickDeploymentTarget.mockResolvedValue("dev");

        await c.service.switchActiveTarget(DOC_DIR);

        expect(c.deploymentState.saveActiveTargetName).toHaveBeenCalledWith("dev");
        expect(c.statusBar.showDeploymentTarget).toHaveBeenCalled();
    });
});

describe("DeploymentTargetService.getStoredCredentials", () => {
    it("resolves oauth2 secrets plus the target's token endpoint and audience", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue(
            fileWith(
                target("dev", {
                    authType: "oauth2",
                    tokenEndpoint: "https://idp/token",
                    audience: "aud",
                }),
            ),
        );
        c.secretStore.getOAuth2.mockResolvedValue({ clientId: "cid", clientSecret: "sec" });

        await expect(c.service.getStoredCredentials("dev", DOC_DIR)).resolves.toEqual({
            authType: "oauth2",
            clientId: "cid",
            clientSecret: "sec",
            tokenEndpoint: "https://idp/token",
            audience: "aud",
        });
        expect(c.secretStore.getOAuth2).toHaveBeenCalledWith(`${FILE_PATH}::dev`);
    });

    it("returns a none payload for an unknown target", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);
        c.workspace.readFile.mockResolvedValue(fileWith(target("dev")));

        await expect(c.service.getStoredCredentials("missing", DOC_DIR)).resolves.toEqual({
            authType: "none",
        });
    });
});

describe("DeploymentTargetService.resolveSlot", () => {
    it("returns undefined for ad-hoc mode", async () => {
        const c = createService();
        expect(await c.service.resolveSlot("", DOC_DIR)).toBeUndefined();
    });

    it("returns the slot for a named target", async () => {
        const c = createService();
        c.artifactService.findConfigFile.mockResolvedValue(FILE_PATH);

        expect(await c.service.resolveSlot("dev", DOC_DIR)).toBe(`${FILE_PATH}::dev`);
    });
});
