import { describe, expect, it, vi } from "vitest";

import { createTestHost, PickerAnswers } from "../../testing";
import { BasicAuth } from "../domain/deployment";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { DeployFilesService } from "./DeployFilesService";

const DOCUMENT_DIR = "/work/processes";
const PICKED_FILES = ["/work/processes/order.bpmn", "/work/decisions/discount.dmn"];

const devTarget = new DeploymentTarget(
    "dev",
    "c7",
    "http://localhost:8080/engine-rest",
    "",
    "basic",
    "",
    "",
);

function createService(answers: PickerAnswers = { workspaceFiles: PICKED_FILES }) {
    const host = createTestHost({ answers });
    const calls: string[] = [];
    const credentials = new BasicAuth("demo", "demo");
    const deploymentTargetService = {
        getActiveTarget: vi.fn().mockResolvedValue(devTarget),
        switchActiveTarget: vi.fn(async () => void calls.push("switchTarget")),
        getCredentials: vi.fn().mockResolvedValue(credentials),
    };
    const deploymentService = {
        deployFiles: vi.fn(async () => {
            calls.push("deploy");
            return [];
        }),
    };
    const deploymentStatusService = {
        refreshActive: vi.fn(async () => void calls.push("refreshStatus")),
    };
    const pickWorkspaceFiles = host.picker.pickWorkspaceFiles.bind(host.picker);
    vi.spyOn(host.picker, "pickWorkspaceFiles").mockImplementation((options) => {
        calls.push("pickFiles");
        return pickWorkspaceFiles(options);
    });
    const afterTargetPicker = vi.fn(async () => void calls.push("afterTargetPicker"));

    const service = new DeployFilesService(
        deploymentTargetService as never,
        deploymentService as never,
        deploymentStatusService as never,
        host.picker,
        host.notifier,
    );

    return {
        service,
        host,
        calls,
        credentials,
        deploymentTargetService,
        deploymentService,
        deploymentStatusService,
        afterTargetPicker,
    };
}

describe("DeployFilesService.deployFiles", () => {
    it("deploys the picked BPMN/DMN files to the active target, then refreshes the status", async () => {
        const c = createService();

        await c.service.deployFiles(DOCUMENT_DIR, c.afterTargetPicker);

        expect(c.deploymentTargetService.getActiveTarget).toHaveBeenCalledWith(DOCUMENT_DIR);
        expect(c.host.picker.prompts).toEqual([
            {
                method: "pickWorkspaceFiles",
                args: [
                    {
                        glob: "**/*.{bpmn,dmn}",
                        exclude: "**/node_modules/**",
                        placeholder: 'Select files to deploy to "dev"',
                    },
                ],
            },
        ]);
        expect(c.deploymentTargetService.getCredentials).toHaveBeenCalledWith(
            devTarget,
            DOCUMENT_DIR,
        );
        expect(c.host.notifier.progressTitles).toEqual(['Deploying 2 file(s) to "dev"']);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            PICKED_FILES,
            devTarget,
            c.credentials,
            DOCUMENT_DIR,
        );
        expect(c.calls).toEqual(["pickFiles", "deploy", "refreshStatus"]);
    });

    it("runs the target picker first when no target is active and deploys to the picked one", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(devTarget);

        await c.service.deployFiles(DOCUMENT_DIR, c.afterTargetPicker);

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith(DOCUMENT_DIR);
        expect(c.deploymentTargetService.getActiveTarget).toHaveBeenNthCalledWith(2, DOCUMENT_DIR);
        expect(c.calls).toEqual([
            "switchTarget",
            "refreshStatus",
            "afterTargetPicker",
            "pickFiles",
            "deploy",
            "refreshStatus",
        ]);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            PICKED_FILES,
            devTarget,
            c.credentials,
            DOCUMENT_DIR,
        );
    });

    it("stops after the target picker when it leaves no active target", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(undefined);

        await c.service.deployFiles(DOCUMENT_DIR, c.afterTargetPicker);

        expect(c.calls).toEqual(["switchTarget", "refreshStatus", "afterTargetPicker"]);
        expect(c.host.picker.prompts).toEqual([]);
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("skips the target picker when a target is already active", async () => {
        const c = createService();

        await c.service.deployFiles(DOCUMENT_DIR, c.afterTargetPicker);

        expect(c.deploymentTargetService.switchActiveTarget).not.toHaveBeenCalled();
        expect(c.afterTargetPicker).not.toHaveBeenCalled();
    });

    it("deploys nothing when the file picker is dismissed", async () => {
        const c = createService({});

        await c.service.deployFiles(DOCUMENT_DIR);

        expect(c.deploymentTargetService.getCredentials).not.toHaveBeenCalled();
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
        expect(c.deploymentStatusService.refreshActive).not.toHaveBeenCalled();
    });

    it("works without a host hook or a focused document", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(devTarget);

        await c.service.deployFiles(undefined);

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith(undefined);
        expect(c.deploymentTargetService.getActiveTarget).toHaveBeenNthCalledWith(2, undefined);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledOnce();
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            PICKED_FILES,
            devTarget,
            c.credentials,
            undefined,
        );
    });

    it("resolves the active target and deploys without a directory when no document is focused", async () => {
        const c = createService();

        await c.service.deployFiles(undefined);

        expect(c.deploymentTargetService.getActiveTarget).toHaveBeenCalledWith(undefined);
        expect(c.deploymentTargetService.getCredentials).toHaveBeenCalledWith(devTarget, undefined);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            PICKED_FILES,
            devTarget,
            c.credentials,
            undefined,
        );
    });
});
