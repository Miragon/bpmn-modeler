import { describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../testing";
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

function createService(diagramPath = FILE_PATH) {
    const host = createTestHost();
    const editor = host.openEditor(diagramPath);
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

    const service = new DeployActiveDiagramService(
        host.store,
        host.documents,
        deploymentTargetService as never,
        deploymentService as never,
        deploymentStatusService as never,
        host.notifier,
    );

    return {
        service,
        host,
        editor,
        deploymentTargetService,
        deploymentService,
        deploymentStatusService,
    };
}

describe("DeployActiveDiagramService.deployActive", () => {
    it("reports when no diagram is focused", async () => {
        const c = createService();
        c.host.store.unregister(c.editor.id, c.editor);

        await c.service.deployActive();

        expect(c.host.notifier.infos).toEqual(["Open a BPMN or DMN diagram to deploy it."]);
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("rejects a non-diagram file such as a form", async () => {
        const c = createService("/work/form.form");

        await c.service.deployActive("/work");

        expect(c.host.notifier.infos).toEqual(["Open a BPMN or DMN diagram to deploy it."]);
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
            "/work",
        );
    });

    it("aborts when the save throws", async () => {
        const c = createService();
        vi.spyOn(c.editor, "save").mockRejectedValue(new Error("read-only file system"));

        await c.service.deployActive("/work");

        expect(c.host.notifier.errors).toEqual([
            "Could not save the diagram before deploying: read-only file system",
        ]);
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("deploys an unmodified diagram whose save returns false", async () => {
        const c = createService();
        vi.spyOn(c.editor, "save").mockResolvedValue(false);

        await c.service.deployActive("/work");

        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            [FILE_PATH],
            target,
            expect.any(NoAuth),
            "/work",
        );
    });

    it("saves before deploying and refreshes the status bar", async () => {
        const c = createService();
        let savesBeforeDeploy: number | undefined;
        c.deploymentService.deployFiles.mockImplementation(async () => {
            savesBeforeDeploy = c.editor.saveCount;
            return [];
        });

        await c.service.deployActive("/work");

        expect(savesBeforeDeploy).toBe(1);
        expect(c.host.notifier.progressTitles).toEqual(['Deploying order-process.bpmn to "dev"']);
        expect(c.deploymentStatusService.refreshActive).toHaveBeenCalled();
    });

    it("hands deployFiles the directory the target was resolved from, so its .env matches", async () => {
        const c = createService();

        await c.service.deployActive("/ws/project");

        expect(c.deploymentTargetService.getActiveTarget).toHaveBeenCalledWith("/ws/project");
        expect(c.deploymentTargetService.getCredentials).toHaveBeenCalledWith(
            target,
            "/ws/project",
        );
        expect(c.deploymentService.deployFiles).toHaveBeenCalledExactlyOnceWith(
            [FILE_PATH],
            target,
            expect.any(NoAuth),
            "/ws/project",
        );
    });

    it("resolves the target and deploys from the diagram's own directory when none is given", async () => {
        const c = createService();

        await c.service.deployActive();

        expect(c.deploymentTargetService.getActiveTarget).toHaveBeenCalledWith("/work");
        expect(c.deploymentService.deployFiles).toHaveBeenCalledExactlyOnceWith(
            [FILE_PATH],
            target,
            expect.any(NoAuth),
            "/work",
        );
    });
});
