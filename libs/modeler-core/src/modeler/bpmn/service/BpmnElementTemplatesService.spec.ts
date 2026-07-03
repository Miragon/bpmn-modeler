import { beforeEach, describe, expect, it, vi } from "vitest";

// `BpmnElementTemplatesService` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { ElementTemplatesQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnElementTemplatesService } from "./BpmnElementTemplatesService";

const EDITOR = "file:///work/.camunda/diagram.bpmn";

/**
 * Wires the service to port doubles. `getArtifactPaths` returns the
 * `[paths, extension]` tuple the production code destructures, and `readFile`
 * resolves whatever JSON text the test stages per path.
 */
function createService() {
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const vsDocument = { getFilePath: vi.fn().mockReturnValue(EDITOR) };
    const artifactSvc = {
        getArtifactPaths: vi.fn().mockResolvedValue([[], ".json"]),
        readFile: vi.fn(),
    };
    const statusBar = {
        showElementTemplatesLoading: vi.fn(),
        showElementTemplatesReady: vi.fn(),
        hideElementTemplatesStatus: vi.fn(),
    };
    const notifier = {
        notifyError: vi.fn(),
        logError: vi.fn(),
        logInfo: vi.fn(),
        logDebug: vi.fn(),
    };
    const marketplaceSvc = { getCachedTemplatePaths: vi.fn().mockResolvedValue([]) };

    const service = new BpmnElementTemplatesService(
        editorStore as never,
        vsDocument as never,
        artifactSvc as never,
        statusBar as never,
        notifier as never,
        marketplaceSvc as never,
    );

    return { service, editorStore, vsDocument, artifactSvc, statusBar, notifier, marketplaceSvc };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnElementTemplatesService.setElementTemplates", () => {
    it("loads, name-sorts, and posts templates, then reports readiness", async () => {
        const { service, editorStore, artifactSvc, statusBar, notifier } = createService();
        artifactSvc.getArtifactPaths.mockResolvedValue([["b.json", "a.json"], ".json"]);
        artifactSvc.readFile.mockImplementation(async (path: string) =>
            path === "b.json"
                ? JSON.stringify({ name: "Zebra" })
                : JSON.stringify({ name: "Apple" }),
        );

        const result = await service.setElementTemplates(EDITOR);

        expect(result).toBe(true);
        expect(statusBar.showElementTemplatesLoading).toHaveBeenCalledOnce();
        const msg = editorStore.postMessage.mock.calls[0][1] as ElementTemplatesQuery;
        expect(msg.type).toBe("ElementTemplatesQuery");
        // Sorted by `name`, independent of file iteration order.
        expect((msg.elementTemplates as unknown as { name: string }[]).map((t) => t.name)).toEqual([
            "Apple",
            "Zebra",
        ]);
        expect(statusBar.showElementTemplatesReady).toHaveBeenCalledWith(2);
        expect(notifier.logInfo).toHaveBeenCalledOnce();
    });

    it("merges cached marketplace templates with workspace-local ones, name-sorted", async () => {
        const { service, editorStore, artifactSvc, marketplaceSvc } = createService();
        artifactSvc.getArtifactPaths.mockResolvedValue([["local.json"], ".json"]);
        marketplaceSvc.getCachedTemplatePaths.mockResolvedValue(["/cache/remote.json"]);
        artifactSvc.readFile.mockImplementation(async (path: string) =>
            path === "local.json"
                ? JSON.stringify({ name: "Local" })
                : JSON.stringify({ name: "Aremote" }),
        );

        const result = await service.setElementTemplates(EDITOR);

        expect(result).toBe(true);
        expect(artifactSvc.readFile).toHaveBeenCalledWith("local.json");
        expect(artifactSvc.readFile).toHaveBeenCalledWith("/cache/remote.json");
        const msg = editorStore.postMessage.mock.calls[0][1] as ElementTemplatesQuery;
        expect((msg.elementTemplates as unknown as { name: string }[]).map((t) => t.name)).toEqual([
            "Aremote",
            "Local",
        ]);
    });

    it("works without a marketplace service (workspace-only host)", async () => {
        const { editorStore, vsDocument, artifactSvc, statusBar, notifier } = createService();
        artifactSvc.getArtifactPaths.mockResolvedValue([["local.json"], ".json"]);
        artifactSvc.readFile.mockResolvedValue(JSON.stringify({ name: "Local" }));
        const service = new BpmnElementTemplatesService(
            editorStore as never,
            vsDocument as never,
            artifactSvc as never,
            statusBar as never,
            notifier as never,
        );

        const result = await service.setElementTemplates(EDITOR);

        expect(result).toBe(true);
        const msg = editorStore.postMessage.mock.calls[0][1] as ElementTemplatesQuery;
        expect(msg.elementTemplates).toEqual([{ name: "Local" }]);
    });

    it("skips and logs a file that fails to parse, keeping the rest", async () => {
        const { service, editorStore, artifactSvc, notifier } = createService();
        artifactSvc.getArtifactPaths.mockResolvedValue([["ok.json", "broken.json"], ".json"]);
        artifactSvc.readFile.mockImplementation(async (path: string) =>
            path === "ok.json" ? JSON.stringify([{ name: "Good" }]) : "{ not json",
        );

        const result = await service.setElementTemplates(EDITOR);

        expect(result).toBe(true);
        expect(notifier.logError).toHaveBeenCalledOnce();
        const msg = editorStore.postMessage.mock.calls[0][1] as ElementTemplatesQuery;
        expect(msg.elementTemplates).toEqual([{ name: "Good" }]);
    });

    it("does not log readiness info when there are no template files", async () => {
        const { service, statusBar, notifier } = createService();

        const result = await service.setElementTemplates(EDITOR);

        expect(result).toBe(true);
        expect(statusBar.showElementTemplatesReady).toHaveBeenCalledWith(0);
        expect(notifier.logInfo).not.toHaveBeenCalled();
    });

    it("hides the status and notifies when the post is rejected by the webview", async () => {
        const { service, editorStore, statusBar, notifier } = createService();
        editorStore.postMessage.mockResolvedValue(false);

        const result = await service.setElementTemplates(EDITOR);

        expect(result).toBe(false);
        expect(statusBar.hideElementTemplatesStatus).toHaveBeenCalledOnce();
        expect(notifier.notifyError).toHaveBeenCalledOnce();
    });

    it("hides the status and notifies when loading throws", async () => {
        const { service, artifactSvc, statusBar, notifier } = createService();
        artifactSvc.getArtifactPaths.mockRejectedValue(new Error("fs blew up"));

        const result = await service.setElementTemplates(EDITOR);

        expect(result).toBe(false);
        expect(statusBar.hideElementTemplatesStatus).toHaveBeenCalledOnce();
        expect(notifier.notifyError).toHaveBeenCalledOnce();
    });
});
