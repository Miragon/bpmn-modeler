import { describe, expect, it, vi } from "vitest";

import { FakeEditorHandle } from "../../testing";
import { EditorSessionDocuments } from "./EditorSessionDocuments";
import { EditorSessionStore } from "./EditorSessionStore";

function openOrder() {
    const editorStore = new EditorSessionStore(() => undefined);
    const order = new FakeEditorHandle("/work/order.bpmn", { content: "<order/>" });
    editorStore.register(order);
    return {
        editorStore,
        order,
        writeContent: vi.spyOn(order, "writeContent"),
        document: new EditorSessionDocuments(editorStore),
    };
}

describe("EditorSessionDocuments", () => {
    it("hands the editor a write at the current host revision together with that revision", async () => {
        const { editorStore, order, writeContent, document } = openOrder();
        const revision = editorStore.markHostDocumentUpdated(order.id);

        await expect(document.write(order.id, "<edited/>", revision)).resolves.toBe(true);
        expect(order.content).toBe("<edited/>");
        expect(writeContent).toHaveBeenCalledWith("<edited/>", revision);
    });

    // IntelliJ refuses this while the host change has not reached the webview.
    it("writes content without a revision after a host change, as VS Code does", async () => {
        const { editorStore, order, writeContent, document } = openOrder();
        editorStore.markHostDocumentUpdated(order.id);

        await expect(document.write(order.id, "<migrated/>")).resolves.toBe(true);
        expect(order.content).toBe("<migrated/>");
        expect(writeContent).toHaveBeenCalledWith("<migrated/>", undefined);
    });
});
