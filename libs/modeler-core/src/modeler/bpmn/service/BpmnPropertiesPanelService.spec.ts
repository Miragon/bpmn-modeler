import { describe, expect, it, vi } from "vitest";

import { PropertiesPanelStateQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../../testing";
import { BpmnPropertiesPanelService } from "./BpmnPropertiesPanelService";

function createService() {
    const host = createTestHost();
    const editor = host.openEditor("/work/diagram.bpmn");
    const service = new BpmnPropertiesPanelService(
        host.store,
        host.propertiesPanelState,
        host.notifier,
    );
    return { service, host, editor };
}

describe("BpmnPropertiesPanelService.getPersistedPanelVisibility", () => {
    it("returns the repository value synchronously", () => {
        const { service, host } = createService();
        host.propertiesPanelState.visible = false;

        expect(service.getPersistedPanelVisibility()).toBe(false);
    });
});

describe("BpmnPropertiesPanelService.sendPropertiesPanelState", () => {
    it("posts the persisted visibility to the webview", async () => {
        const { service, host, editor } = createService();
        host.propertiesPanelState.visible = false;

        const result = await service.sendPropertiesPanelState(editor.id);

        expect(result).toBe(true);
        const [msg] = editor.posted;
        expect(msg).toBeInstanceOf(PropertiesPanelStateQuery);
        expect((msg as PropertiesPanelStateQuery).visible).toBe(false);
    });

    it("returns false when the webview rejects the post", async () => {
        const { service, editor } = createService();
        vi.spyOn(editor, "postMessage").mockResolvedValue(false);

        expect(await service.sendPropertiesPanelState(editor.id)).toBe(false);
    });

    it("logs and returns false when posting throws", async () => {
        const { service, host, editor } = createService();
        editor.hidden = true;

        const result = await service.sendPropertiesPanelState(editor.id);

        expect(result).toBe(false);
        expect(host.notifier.logged("error")).toEqual(["The active editor is hidden."]);
    });
});

describe("BpmnPropertiesPanelService.setPropertiesPanelVisibility", () => {
    it("delegates to the repository", async () => {
        const { service, host } = createService();

        await service.setPropertiesPanelVisibility(false);

        expect(host.propertiesPanelState.visible).toBe(false);
    });

    it("swallows and logs a persistence failure", async () => {
        const { service, host } = createService();
        vi.spyOn(host.propertiesPanelState, "setVisibility").mockRejectedValue(
            new Error("state write failed"),
        );

        await expect(service.setPropertiesPanelVisibility(true)).resolves.toBeUndefined();
        expect(host.notifier.logged("error")).toEqual(["state write failed"]);
    });
});
