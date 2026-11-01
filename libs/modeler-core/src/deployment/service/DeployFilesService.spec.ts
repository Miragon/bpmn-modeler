import { describe, expect, it, vi } from "vitest";

import { createTestHost, PromptAnswers } from "../../testing";
import { BasicAuth } from "../domain/deployment";
import { AdHocDestination, NamedDestination } from "../domain/deploymentDestination";
import { fileChoice } from "../../kernel/domain/fileChoices";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { DeployFilesService } from "./DeployFilesService";

const DOCUMENT_DIR = "/work/processes";
const PICKED_FILES = ["/work/processes/order.bpmn", "/work/decisions/discount.dmn"];
/** The BPMN and DMN files outside dependencies and build output, ordered as VS Code shows their paths. */
const DEPLOYABLE_FILES = [
    "/work/decisions/discount.dmn",
    "/work/processes/invoice.bpmn",
    "/work/processes/order.bpmn",
    "/archive/zeta/legacy.bpmn",
];
const WORKSPACE_FOLDERS = ["/work", "/archive/zeta"];
const WORKSPACE_FILES = {
    "/work/processes/order.bpmn": "<definitions/>",
    "/work/processes/invoice.bpmn": "<definitions/>",
    "/work/forms/order.form": "{}",
    "/work/node_modules/library/process.bpmn": "<definitions/>",
    "/work/target/classes/order.bpmn": "<definitions/>",
    "/work/decisions/discount.dmn": "<definitions/>",
    "/archive/zeta/legacy.bpmn": "<definitions/>",
};

const devTarget = new DeploymentTarget(
    "dev",
    "c7",
    "http://localhost:8080/engine-rest",
    "",
    "basic",
    "",
    "",
);
const devDestination = new NamedDestination(devTarget, {
    filePath: "/work/.camunda/deployment-targets.json",
    exists: true,
    projectDir: "/work",
});
/** No target is active. */
const AD_HOC = new AdHocDestination("http://localhost:8080/engine-rest", "");

function createService(promptAnswers: PromptAnswers = { deployableFiles: PICKED_FILES }) {
    const host = createTestHost({
        folders: WORKSPACE_FOLDERS,
        files: WORKSPACE_FILES,
        promptAnswers,
    });
    const calls: string[] = [];
    const credentials = new BasicAuth("demo", "demo");
    const deploymentTargetService = {
        getActiveDestination: vi.fn().mockResolvedValue(devDestination),
        switchActiveTarget: vi.fn(async () => void calls.push("switchTarget")),
        getCredentials: vi.fn().mockResolvedValue(credentials),
    };
    const deploymentService = {
        deployFiles: vi.fn(async () => {
            calls.push("deploy");
            return [];
        }),
    };
    const chooseMany = host.picker.chooseMany.bind(host.picker);
    vi.spyOn(host.picker, "chooseMany").mockImplementation((prompt) => {
        calls.push("pickFiles");
        return chooseMany(prompt);
    });

    const service = new DeployFilesService(
        deploymentTargetService as never,
        deploymentService as never,
        host.workspace,
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
    };
}

describe("DeployFilesService.deployFiles", () => {
    it("deploys the picked BPMN/DMN files to the active target", async () => {
        const c = createService();

        await c.service.deployFiles(DOCUMENT_DIR);

        expect(c.deploymentTargetService.getActiveDestination).toHaveBeenCalledWith(DOCUMENT_DIR);
        expect(c.host.picker.prompts).toEqual([
            {
                method: "chooseMany",
                args: [
                    {
                        id: "deployableFiles",
                        placeholder: 'Select files to deploy to "dev"',
                        items: DEPLOYABLE_FILES.map(fileChoice),
                    },
                ],
            },
        ]);
        expect(c.deploymentTargetService.getCredentials).toHaveBeenCalledWith(devDestination);
        expect(c.host.notifier.progressTitles).toEqual(['Deploying 2 file(s) to "dev"']);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            PICKED_FILES,
            devDestination,
            c.credentials,
            DOCUMENT_DIR,
        );
        expect(c.calls).toEqual(["pickFiles", "deploy"]);
    });

    it("runs the target picker first when no target is active and deploys to the picked one", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination
            .mockResolvedValueOnce(AD_HOC)
            .mockResolvedValueOnce(devDestination);

        await c.service.deployFiles(DOCUMENT_DIR);

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith(DOCUMENT_DIR);
        expect(c.deploymentTargetService.getActiveDestination).toHaveBeenNthCalledWith(
            2,
            DOCUMENT_DIR,
        );
        expect(c.calls).toEqual(["switchTarget", "pickFiles", "deploy"]);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            PICKED_FILES,
            devDestination,
            c.credentials,
            DOCUMENT_DIR,
        );
    });

    it("stops after the target picker when it leaves no active target", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(AD_HOC);

        await c.service.deployFiles(DOCUMENT_DIR);

        expect(c.calls).toEqual(["switchTarget"]);
        expect(c.host.picker.prompts).toEqual([]);
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("skips the target picker when a target is already active", async () => {
        const c = createService();

        await c.service.deployFiles(DOCUMENT_DIR);

        expect(c.deploymentTargetService.switchActiveTarget).not.toHaveBeenCalled();
    });

    it("deploys nothing when the file picker is dismissed", async () => {
        const c = createService({});

        await c.service.deployFiles(DOCUMENT_DIR);

        expect(c.deploymentTargetService.getCredentials).not.toHaveBeenCalled();
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("deploys nothing when the secret store cannot be read", async () => {
        const c = createService();
        const unavailable = new Error("The OS keyring is not available.");
        c.deploymentTargetService.getCredentials.mockRejectedValue(unavailable);

        await expect(c.service.deployFiles(DOCUMENT_DIR)).rejects.toBe(unavailable);

        expect(c.calls).toEqual(["pickFiles"]);
        expect(c.host.notifier.progressTitles).toEqual([]);
    });

    it("works without a focused document", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination
            .mockResolvedValueOnce(AD_HOC)
            .mockResolvedValueOnce(devDestination);

        await c.service.deployFiles(undefined);

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith(undefined);
        expect(c.deploymentTargetService.getActiveDestination).toHaveBeenNthCalledWith(
            2,
            undefined,
        );
        expect(c.deploymentService.deployFiles).toHaveBeenCalledOnce();
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            PICKED_FILES,
            devDestination,
            c.credentials,
            undefined,
        );
    });

    it("resolves the active target and deploys without a directory when no document is focused", async () => {
        const c = createService();

        await c.service.deployFiles(undefined);

        expect(c.deploymentTargetService.getActiveDestination).toHaveBeenCalledWith(undefined);
        expect(c.deploymentTargetService.getCredentials).toHaveBeenCalledWith(devDestination);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            PICKED_FILES,
            devDestination,
            c.credentials,
            undefined,
        );
    });
});
