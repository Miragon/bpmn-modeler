import { beforeEach, describe, expect, it, vi } from "vitest";

// `BpmnPropertiesPanelService` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { PropertiesPanelStateQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnPropertiesPanelService } from "./BpmnPropertiesPanelService";

const EDITOR = "file:///work/diagram.bpmn";

function createService() {
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const panelStateRepo = {
        getVisibility: vi.fn().mockReturnValue(true),
        setVisibility: vi.fn().mockResolvedValue(undefined),
    };
    const notifier = { logError: vi.fn() };

    const service = new BpmnPropertiesPanelService(
        editorStore as never,
        panelStateRepo as never,
        notifier as never,
    );

    return { service, editorStore, panelStateRepo, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnPropertiesPanelService.getPersistedPanelVisibility", () => {
    it("returns the repository value synchronously", () => {
        const { service, panelStateRepo } = createService();
        panelStateRepo.getVisibility.mockReturnValue(false);

        expect(service.getPersistedPanelVisibility()).toBe(false);
        expect(panelStateRepo.getVisibility).toHaveBeenCalledOnce();
    });
});

describe("BpmnPropertiesPanelService.sendPropertiesPanelState", () => {
    it("posts the persisted visibility to the webview", async () => {
        const { service, editorStore, panelStateRepo } = createService();
        panelStateRepo.getVisibility.mockReturnValue(false);

        const result = await service.sendPropertiesPanelState(EDITOR);

        expect(result).toBe(true);
        const [id, msg] = editorStore.postMessage.mock.calls[0];
        expect(id).toBe(EDITOR);
        expect(msg).toBeInstanceOf(PropertiesPanelStateQuery);
        expect((msg as PropertiesPanelStateQuery).visible).toBe(false);
    });

    it("returns false when the webview rejects the post", async () => {
        const { service, editorStore } = createService();
        editorStore.postMessage.mockResolvedValue(false);

        expect(await service.sendPropertiesPanelState(EDITOR)).toBe(false);
    });

    it("logs and returns false when posting throws", async () => {
        const { service, editorStore, notifier } = createService();
        editorStore.postMessage.mockRejectedValue(new Error("hidden editor"));

        const result = await service.sendPropertiesPanelState(EDITOR);

        expect(result).toBe(false);
        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});

describe("BpmnPropertiesPanelService.setPropertiesPanelVisibility", () => {
    it("delegates to the repository", async () => {
        const { service, panelStateRepo } = createService();

        await service.setPropertiesPanelVisibility(false);

        expect(panelStateRepo.setVisibility).toHaveBeenCalledWith(false);
    });

    it("swallows and logs a persistence failure", async () => {
        const { service, panelStateRepo, notifier } = createService();
        panelStateRepo.setVisibility.mockRejectedValue(new Error("state write failed"));

        await expect(service.setPropertiesPanelVisibility(true)).resolves.toBeUndefined();
        expect(notifier.logError).toHaveBeenCalledOnce();
    });
});
