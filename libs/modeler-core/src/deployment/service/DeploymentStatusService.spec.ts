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
        listLedgerKeys: vi.fn().mockReturnValue([]),
        deleteDeployedRevisions: vi.fn().mockResolvedValue(undefined),
    };
    const statusBar = {
        showDeploymentTarget: vi.fn(),
        hideDeploymentTarget: vi.fn(),
    };
    const picker = {
        pickDeploymentStatusAction: vi.fn().mockResolvedValue(undefined),
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
        picker as never,
        notifier as never,
    );

    return {
        service,
        editorStore,
        documentPort,
        deploymentTargetService,
        deploymentState,
        statusBar,
        picker,
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
            "target:dev@localhost:8080::/work/order-process.bpmn",
            expect.objectContaining({
                fingerprint: contentFingerprint("<a/>"),
                deploymentId: "dep-42",
                origin: "local",
            }),
        );
    });
});

describe("DeploymentStatusService ledger writes", () => {
    const identity = () => DeploymentTargetIdentity.fromTarget(target("dev"));

    it("adopts an engine revision under the identity/file key", async () => {
        const c = createService();
        const revision = {
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:40:00.000Z",
            deploymentId: "dep-9",
            origin: "engine" as const,
            verifiedAt: "2026-09-17T15:00:00.000Z",
        };

        await c.service.adoptRevision(FILE_PATH, identity(), revision);

        expect(c.deploymentState.saveDeployedRevision).toHaveBeenCalledWith(
            "target:dev@localhost:8080::/work/order-process.bpmn",
            revision,
        );
    });

    it("forgets a single revision", async () => {
        const c = createService();

        await c.service.forgetRevision(FILE_PATH, identity());

        expect(c.deploymentState.deleteDeployedRevisions).toHaveBeenCalledWith([
            "target:dev@localhost:8080::/work/order-process.bpmn",
        ]);
    });

    it("prunes exactly the identity's rows", async () => {
        const c = createService();
        c.deploymentState.listLedgerKeys.mockReturnValue([
            "target:dev@localhost:8080::/work/a.bpmn",
            "target:dev@localhost:8080::/work/b.bpmn",
            "target:dev@other.example.com::/work/a.bpmn",
            "target:prod@localhost:8080::/work/a.bpmn",
        ]);

        await c.service.pruneTarget(identity());

        expect(c.deploymentState.deleteDeployedRevisions).toHaveBeenCalledWith([
            "target:dev@localhost:8080::/work/a.bpmn",
            "target:dev@localhost:8080::/work/b.bpmn",
        ]);
    });

    it("skips the delete round-trip when nothing matches", async () => {
        const c = createService();

        await c.service.pruneTarget(identity());

        expect(c.deploymentState.deleteDeployedRevisions).not.toHaveBeenCalled();
    });
});

describe("DeploymentStatusService.pickStatusBarAction", () => {
    it("offers verify for a named C7 target", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));
        c.picker.pickDeploymentStatusAction.mockResolvedValue("verify");

        await expect(c.service.pickStatusBarAction("/work")).resolves.toBe("verify");

        expect(c.picker.pickDeploymentStatusAction).toHaveBeenCalledWith({
            targetName: "dev",
            canVerify: true,
        });
    });

    it("withholds verify without a named target", async () => {
        const c = createService();

        await c.service.pickStatusBarAction();

        expect(c.picker.pickDeploymentStatusAction).toHaveBeenCalledWith({
            targetName: undefined,
            canVerify: false,
        });
    });

    it("withholds verify for a Camunda 8 target", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(
            new DeploymentTarget("cloud", "c8", "https://c8.example.com", "", "none", "", ""),
        );

        await c.service.pickStatusBarAction();

        expect(c.picker.pickDeploymentStatusAction).toHaveBeenCalledWith({
            targetName: "cloud",
            canVerify: false,
        });
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
            undefined,
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
            undefined,
        );
    });

    it("renders superseded (blue) and passes verifiedAt for an engine-origin mismatch", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveTarget.mockResolvedValue(target("dev"));
        c.documentPort.getContent.mockReturnValue("<b/>");
        c.deploymentState.getDeployedRevision.mockReturnValue({
            fingerprint: contentFingerprint("<a/>"),
            deployedAt: "2026-09-17T14:40:00.000Z",
            origin: "engine",
            verifiedAt: "2026-09-17T15:00:00.000Z",
        });

        await c.service.refresh("editor-1");

        expect(c.statusBar.showDeploymentTarget).toHaveBeenCalledWith(
            "dev",
            "superseded",
            "2026-09-17T14:40:00.000Z",
            "2026-09-17T15:00:00.000Z",
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
