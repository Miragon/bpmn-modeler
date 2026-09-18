import { beforeEach, describe, expect, it, vi } from "vitest";

import { NoAuth } from "../domain/deployment";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { DeployActiveDiagramService } from "./DeployActiveDiagramService";

const FILE_PATH = "/work/order-process.bpmn";

const target = new DeploymentTarget(
    "dev",
    "c7",
    "http://localhost:8080/engine-rest",
    "",
    "none",
    "",
    "",
);

function createService() {
    const editorStore = {
        getActiveEditorId: vi.fn().mockReturnValue("editor-1"),
    };
    const documentPort = {
        getFilePath: vi.fn().mockReturnValue(FILE_PATH),
        save: vi.fn().mockResolvedValue(true),
    };
    const deploymentTargetService = {
        getActiveTarget: vi.fn().mockResolvedValue(target),
        switchActiveTarget: vi.fn().mockResolvedValue(undefined),
        getCredentials: vi.fn().mockResolvedValue(new NoAuth()),
    };
    const deploymentService = {
        deployFiles: vi.fn().mockResolvedValue([]),
    };
    const deploymentStatusService = {
        refreshActive: vi.fn().mockResolvedValue(undefined),
    };
    const notifier = {
        showInfo: vi.fn(),
        showError: vi.fn(),
        withProgress: vi.fn((_title: string, task: () => Promise<unknown>) => task()),
    };

    const service = new DeployActiveDiagramService(
        editorStore as never,
        documentPort as never,
        deploymentTargetService as never,
        deploymentService as never,
        deploymentStatusService as never,
        notifier as never,
    );

    return {
        service,
        editorStore,
        documentPort,
        deploymentTargetService,
        deploymentService,
        deploymentStatusService,
        notifier,
    };
}

beforeEach(() => vi.clearAllMocks());

describe("DeployActiveDiagramService.deployActive", () => {
    it("reports when no diagram is focused", async () => {
        const c = createService();
        c.editorStore.getActiveEditorId.mockImplementation(() => {
            throw new Error("no active editor");
        });

        await c.service.deployActive();

        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            "Open a BPMN or DMN diagram to deploy it.",
        );
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("rejects a non-diagram file such as a form", async () => {
        const c = createService();
        c.documentPort.getFilePath.mockReturnValue("/work/form.form");

        await c.service.deployActive("/work");

        expect(c.notifier.showInfo).toHaveBeenCalledWith(
            "Open a BPMN or DMN diagram to deploy it.",
        );
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("runs the target picker and aborts when none is chosen", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(undefined);

        await c.service.deployActive("/work");

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith("/work");
        expect(c.deploymentStatusService.refreshActive).toHaveBeenCalled();
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("deploys after the picker selects a target", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(target);

        await c.service.deployActive("/work");

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith("/work");
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            [FILE_PATH],
            target,
            expect.any(NoAuth),
        );
    });

    it("aborts when the save throws", async () => {
        const c = createService();
        c.documentPort.save.mockRejectedValue(new Error("read-only file system"));

        await c.service.deployActive("/work");

        expect(c.notifier.showError).toHaveBeenCalledWith(
            expect.stringContaining("read-only file system"),
        );
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("deploys an unmodified diagram whose save returns false", async () => {
        const c = createService();
        c.documentPort.save.mockResolvedValue(false);

        await c.service.deployActive("/work");

        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            [FILE_PATH],
            target,
            expect.any(NoAuth),
        );
    });

    it("saves before deploying and refreshes the status bar", async () => {
        const c = createService();
        const calls: string[] = [];
        c.documentPort.save.mockImplementation(async () => {
            calls.push("save");
            return true;
        });
        c.deploymentService.deployFiles.mockImplementation(async () => {
            calls.push("deploy");
            return [];
        });

        await c.service.deployActive("/work");

        expect(calls).toEqual(["save", "deploy"]);
        expect(c.notifier.withProgress).toHaveBeenCalledWith(
            'Deploying order-process.bpmn to "dev"',
            expect.any(Function),
        );
        expect(c.deploymentStatusService.refreshActive).toHaveBeenCalled();
    });
});
