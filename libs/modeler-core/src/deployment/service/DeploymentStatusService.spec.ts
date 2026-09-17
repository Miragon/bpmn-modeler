import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeploymentTarget } from "../domain/deploymentTarget";
import {
    contentFingerprint,
    DeploymentTargetIdentity,
    ledgerKeyFor,
} from "../domain/deploymentLedger";
import { DeploymentStatusService } from "./DeploymentStatusService";

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const FILE_PATH = "/work/order-process.bpmn";
const target = (name: string): DeploymentTarget =>
    new DeploymentTarget(name, "c7", "http://localhost:8080/engine-rest", "", "none", "", "");

function createService() {
    const editorStore = {
        getActiveEditorId: vi.fn().mockReturnValue("editor-1"),
    };
    const documentPort = {
        getFilePath: vi.fn().mockReturnValue(FILE_PATH),
        getContent: vi.fn().mockReturnValue("<a/>"),
    };
    const deploymentTargetService = {
        getActiveTarget: vi.fn().mockResolvedValue(undefined),
    };
    const deploymentState = {
        getEndpoint: vi.fn().mockReturnValue("http://localhost:8080/engine-rest"),
        getTenantId: vi.fn().mockReturnValue(""),
        getDeployedRevision: vi.fn().mockReturnValue(undefined),
        saveDeployedRevision: vi.fn().mockResolvedValue(undefined),
    };
    const statusBar = {
        showDeploymentTarget: vi.fn(),
        hideDeploymentTarget: vi.fn(),
    };
    const notifier = {
        logDebug: vi.fn(),
    };

    const service = new DeploymentStatusService(
        editorStore as never,
        documentPort as never,
        deploymentTargetService as never,
        deploymentState as never,
        statusBar as never,
        notifier as never,
    );

    return {
        service,
        editorStore,
        documentPort,
        deploymentTargetService,
        deploymentState,
        statusBar,
        notifier,
    };
}

beforeEach(() => vi.clearAllMocks());

describe("DeploymentStatusService.recordDeployment", () => {
    it("stores a fingerprint + timestamp under the identity/file ledger key", async () => {
        const c = createService();

        await c.service.recordDeployment(
            FILE_PATH,
            "<a/>",
            DeploymentTargetIdentity.fromTarget(target("dev")),
            "dep-42",
        );

        expect(c.deploymentState.saveDeployedRevision).toHaveBeenCalledWith(
            "target:dev::/work/order-process.bpmn",
            expect.objectContaining({
                fingerprint: contentFingerprint("<a/>"),
                deploymentId: "dep-42",
            }),
        );
    });
});

describe("DeploymentStatusService.refresh", () => {
    it("ignores requests from an inactive editor", async () => {
        const c = createService();
        await c.service.refresh("background");
        expect(c.statusBar.showDeploymentTarget).not.toHaveBeenCalled();
        expect(c.statusBar.hideDeploymentTarget).not.toHaveBeenCalled();
    });

    it.each(["resolve", "reject"])("ignores a stale lookup that later %s", async (outcome) => {
        const c = createService();
        const pending = deferred<DeploymentTarget | undefined>();
        c.deploymentTargetService.getActiveTarget.mockReturnValueOnce(pending.promise);
        const oldRefresh = c.service.refresh("editor-1");
        c.editorStore.getActiveEditorId.mockReturnValue("editor-2");
        await c.service.refresh("editor-2");
        c.statusBar.showDeploymentTarget.mockClear();
        if (outcome === "resolve") pending.resolve(target("old"));
        else pending.reject(new Error("stale error"));
        await oldRefresh;
        expect(c.statusBar.showDeploymentTarget).not.toHaveBeenCalled();
        expect(c.statusBar.hideDeploymentTarget).not.toHaveBeenCalled();
    });

    it("invalidates pending refreshes when hidden, even if the active pointer is unchanged", async () => {
        const c = createService();
        const pending = deferred<DeploymentTarget | undefined>();
        c.deploymentTargetService.getActiveTarget.mockReturnValueOnce(pending.promise);
        const refresh = c.service.refresh("editor-1");
        c.service.hide();
        pending.resolve(target("old"));
        await refresh;
        expect(c.statusBar.showDeploymentTarget).not.toHaveBeenCalled();
    });

    it("only publishes the newest lookup for the same editor", async () => {
        const c = createService();
        const pending = deferred<DeploymentTarget | undefined>();
        c.deploymentTargetService.getActiveTarget.mockReturnValueOnce(pending.promise);
        const old = c.service.refresh("editor-1");
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("new"));
        await c.service.refresh("editor-1");
        pending.resolve(target("old"));
        await old;
        expect(c.statusBar.showDeploymentTarget).toHaveBeenCalledExactlyOnceWith(
            "new",
            "unknown",
            undefined,
        );
    });
    it("renders unknown when no revision is recorded", async () => {
        const c = createService();

        await c.service.refresh("editor-1");

        expect(c.statusBar.showDeploymentTarget).toHaveBeenCalledWith(
            undefined,
            "unknown",
            undefined,
        );
    });

    it("renders deployed (green) when content matches the recorded fingerprint", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));
        c.deploymentState.getDeployedRevision.mockReturnValue({
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:32:00.000Z",
        });

        await c.service.refresh("editor-1");

        expect(c.deploymentState.getDeployedRevision).toHaveBeenCalledWith(
            ledgerKeyFor(DeploymentTargetIdentity.fromTarget(target("dev")), FILE_PATH),
        );
        expect(c.statusBar.showDeploymentTarget).toHaveBeenCalledWith(
            "dev",
            "deployed",
            "2026-09-17T14:32:00.000Z",
        );
    });

    it("renders changed (yellow) when content differs from the recorded fingerprint", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));
        c.documentPort.getContent.mockReturnValue("<b/>");
        c.deploymentState.getDeployedRevision.mockReturnValue({
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:32:00.000Z",
        });

        await c.service.refresh("editor-1");

        expect(c.statusBar.showDeploymentTarget).toHaveBeenCalledWith(
            "dev",
            "changed",
            "2026-09-17T14:32:00.000Z",
        );
    });

    it("hides the item when the editor has no resolvable document", async () => {
        const c = createService();
        c.documentPort.getFilePath.mockImplementation(() => {
            throw new Error("no active editor");
        });

        await c.service.refresh("editor-1");

        expect(c.statusBar.hideDeploymentTarget).toHaveBeenCalled();
    });
});
