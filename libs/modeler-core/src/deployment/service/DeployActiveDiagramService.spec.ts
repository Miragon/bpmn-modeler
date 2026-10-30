import { describe, expect, it, vi } from "vitest";

import { DocumentFlushedCommand, FlushDocumentQuery } from "@miragon/bpmn-modeler-shared";

import { DocumentFlushService } from "../../editorSession/service/DocumentFlushService";
import { PendingEditsFlush } from "../../editorSession/service/PendingEditsFlush";
import { createTestHost, FakeEditorHandle, TestHost } from "../../testing";
import { NoAuth } from "../domain/deployment";
import { AdHocDestination, NamedDestination } from "../domain/deploymentDestination";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { DeployActiveDiagramService } from "./DeployActiveDiagramService";
import { SaveBeforeDeploy } from "./SaveBeforeDeploy";

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
const destination = new NamedDestination(target, {
    filePath: "/work/.camunda/deployment-targets.json",
    exists: true,
    projectDir: "/work",
});
/** No target is active. */
const AD_HOC = new AdHocDestination("http://localhost:8080/engine-rest", "");

type PendingEdits = Pick<PendingEditsFlush, "flushIntoDocument">;

/** A webview with nothing pending: the document already holds every edit. */
const cleanWebview = (_host: TestHost, editor: FakeEditorHandle): PendingEdits => ({
    flushIntoDocument: async () => ({ status: "safe", session: editor }),
});

interface ServiceOptions {
    diagramPath?: string;
    content?: string;
    pendingEdits?: (host: TestHost, editor: FakeEditorHandle) => PendingEdits;
}

function createService({
    diagramPath = FILE_PATH,
    content = "",
    pendingEdits = cleanWebview,
}: ServiceOptions = {}) {
    const host = createTestHost();
    const editor = host.openEditor(diagramPath, content);
    const deploymentTargetService = {
        getActiveDestination: vi.fn().mockResolvedValue(destination),
        switchActiveTarget: vi.fn().mockResolvedValue(undefined),
        getCredentials: vi.fn().mockResolvedValue(new NoAuth()),
    };
    const deploymentService = {
        deployFiles: vi.fn().mockResolvedValue([]),
    };

    const service = new DeployActiveDiagramService(
        host.store,
        host.documents,
        deploymentTargetService as never,
        deploymentService as never,
        host.notifier,
        new SaveBeforeDeploy(host.documents, pendingEdits(host, editor)),
    );

    return {
        service,
        host,
        editor,
        deploymentTargetService,
        deploymentService,
    };
}

/**
 * Plays a webview whose debounced `edit` has not reached the document yet: it
 * answers each flush query with that edit, as the real webview does.
 */
function webviewWithUnsyncedEdit(host: TestHost, editor: FakeEditorHandle, edit: string) {
    const flushes = new DocumentFlushService(host.store, host.notifier);
    const deliver = editor.postMessage.bind(editor);
    editor.postMessage = async (message) => {
        const delivered = await deliver(message);
        if (message instanceof FlushDocumentQuery) {
            queueMicrotask(() =>
                flushes.handleReply(new DocumentFlushedCommand(message.token, edit), editor.id),
            );
        }
        return delivered;
    };
    const pendingEdits = new PendingEditsFlush(host.store, flushes, host.notifier);
    pendingEdits.serve(".bpmn", {
        sync: (editorId, content) => host.documents.write(editorId, content),
    });
    return pendingEdits;
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
        const c = createService({ diagramPath: "/work/form.form" });

        await c.service.deployActive("/work");

        expect(c.host.notifier.infos).toEqual(["Open a BPMN or DMN diagram to deploy it."]);
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("runs the target picker and aborts when none is chosen", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination.mockResolvedValue(AD_HOC);

        await c.service.deployActive("/work");

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith("/work");
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("deploys after the picker selects a target", async () => {
        const c = createService();
        c.deploymentTargetService.getActiveDestination
            .mockResolvedValueOnce(AD_HOC)
            .mockResolvedValueOnce(destination);

        await c.service.deployActive("/work");

        expect(c.deploymentTargetService.switchActiveTarget).toHaveBeenCalledWith("/work");
        expect(c.deploymentService.deployFiles).toHaveBeenCalledWith(
            [FILE_PATH],
            destination,
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

    it("deploys nothing when the secret store cannot be read", async () => {
        const c = createService();
        const unavailable = new Error("The OS keyring is not available.");
        c.deploymentTargetService.getCredentials.mockRejectedValue(unavailable);

        await expect(c.service.deployActive("/work")).rejects.toBe(unavailable);

        expect(c.host.notifier.progressTitles).toEqual([]);
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("aborts when the host reports that the save failed", async () => {
        const c = createService();
        vi.spyOn(c.editor, "save").mockResolvedValue(false);

        await c.service.deployActive("/work");

        expect(c.host.notifier.errors).toEqual([
            "The diagram could not be saved, so it was not deployed.",
        ]);
        expect(c.deploymentService.deployFiles).not.toHaveBeenCalled();
    });

    it("saves before deploying", async () => {
        const c = createService();
        let savesBeforeDeploy: number | undefined;
        c.deploymentService.deployFiles.mockImplementation(async () => {
            savesBeforeDeploy = c.editor.saveCount;
            return [];
        });

        await c.service.deployActive("/work");

        expect(savesBeforeDeploy).toBe(1);
        expect(c.host.notifier.progressTitles).toEqual(['Deploying order-process.bpmn to "dev"']);
    });

    it("hands deployFiles the directory the target was resolved from, so its .env matches", async () => {
        const c = createService();

        await c.service.deployActive("/ws/project");

        expect(c.deploymentTargetService.getActiveDestination).toHaveBeenCalledWith("/ws/project");
        expect(c.deploymentTargetService.getCredentials).toHaveBeenCalledWith(destination);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledExactlyOnceWith(
            [FILE_PATH],
            destination,
            expect.any(NoAuth),
            "/ws/project",
        );
    });

    it("flushes the webview's pending edits before saving the diagram it deploys", async () => {
        const steps: string[] = [];
        const c = createService({
            pendingEdits: (_host, editor) => ({
                flushIntoDocument: async (editorId) => {
                    steps.push(`flush ${editorId}`);
                    return { status: "safe", session: editor };
                },
            }),
        });
        vi.spyOn(c.editor, "save").mockImplementation(async () => {
            steps.push("save");
            return true;
        });

        await c.service.deployActive("/work");

        expect(steps).toEqual([`flush ${c.editor.id}`, "save"]);
    });

    it("saves the webview's unsynced edit, not the stale document", async () => {
        const steps: string[] = [];
        const c = createService({
            content: "<v1/>",
            pendingEdits: (host, editor) => webviewWithUnsyncedEdit(host, editor, "<v2/>"),
        });
        vi.spyOn(c.editor, "save").mockImplementation(async () => {
            steps.push(`save ${c.editor.content}`);
            return true;
        });
        c.deploymentService.deployFiles.mockImplementation(async () => {
            steps.push("deploy");
            return [];
        });

        await c.service.deployActive("/work");

        expect(steps).toEqual(["save <v2/>", "deploy"]);
    });

    it("keeps the webview editable after the deploy by asking for a non-destructive flush", async () => {
        const c = createService({
            pendingEdits: (host, editor) => webviewWithUnsyncedEdit(host, editor, "<v2/>"),
        });

        await c.service.deployActive("/work");

        expect(
            c.editor
                .postedOfType<FlushDocumentQuery>("FlushDocumentQuery")
                .map((query) => query.destructive),
        ).toEqual([false]);
    });

    it("still saves and deploys when the webview cannot confirm its pending edits", async () => {
        const c = createService({
            pendingEdits: () => ({ flushIntoDocument: async () => ({ status: "unavailable" }) }),
        });

        await c.service.deployActive("/work");

        expect(c.editor.saveCount).toBe(1);
        expect(c.deploymentService.deployFiles).toHaveBeenCalledOnce();
    });

    it("deploys the focused diagram, not one that resolved behind it", async () => {
        const c = createService();
        c.editor.becomeActive();
        c.host.openEditor("/work/resolved-behind.bpmn");

        await c.service.deployActive("/work");

        expect(c.deploymentService.deployFiles).toHaveBeenCalledExactlyOnceWith(
            [FILE_PATH],
            destination,
            expect.any(NoAuth),
            "/work",
        );
    });

    it("resolves the target and deploys from the diagram's own directory when none is given", async () => {
        const c = createService();

        await c.service.deployActive();

        expect(c.deploymentTargetService.getActiveDestination).toHaveBeenCalledWith("/work");
        expect(c.deploymentService.deployFiles).toHaveBeenCalledExactlyOnceWith(
            [FILE_PATH],
            destination,
            expect.any(NoAuth),
            "/work",
        );
    });
});
