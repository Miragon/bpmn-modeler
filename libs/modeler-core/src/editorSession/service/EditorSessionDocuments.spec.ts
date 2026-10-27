import { describe, expect, it, vi } from "vitest";

import { FakeEditorHandle } from "../../testing";
import { EditorSessionDocuments } from "./EditorSessionDocuments";
import { EditorSessionStore } from "./EditorSessionStore";

const ORDER_ID = "file:///work/order.bpmn";

function openEditors() {
    const editorStore = new EditorSessionStore(() => undefined);
    const order = new FakeEditorHandle("/work/order.bpmn", { content: "<order/>" });
    const invoice = new FakeEditorHandle("/work/invoice.bpmn", { content: "<invoice/>" });
    editorStore.register(order);
    editorStore.register(invoice);
    return { editorStore, order, invoice, document: new EditorSessionDocuments(editorStore) };
}

describe("EditorSessionDocuments", () => {
    it("routes every operation to the addressed editor, not the active one", async () => {
        const { order, invoice, document } = openEditors();

        expect(document.getContent(ORDER_ID)).toBe("<order/>");
        expect(document.getFilePath(ORDER_ID)).toBe("/work/order.bpmn");
        await document.save(ORDER_ID);

        expect(order.saveCount).toBe(1);
        expect(invoice.saveCount).toBe(0);
    });

    it("writes webview content based on the current host revision", async () => {
        const { editorStore, order, document } = openEditors();
        const writeContent = vi.spyOn(order, "writeContent");
        const revision = editorStore.markHostDocumentUpdated(ORDER_ID);

        await expect(document.write(ORDER_ID, "<edited/>", revision)).resolves.toBe(true);
        expect(order.content).toBe("<edited/>");
        expect(writeContent).toHaveBeenCalledWith("<edited/>", revision);
    });

    it("drops webview content based on a revision the host has since replaced", async () => {
        const { editorStore, order, document } = openEditors();
        const staleRevision = editorStore.markHostDocumentUpdated(ORDER_ID);
        editorStore.markHostDocumentUpdated(ORDER_ID);

        await expect(document.write(ORDER_ID, "<stale/>", staleRevision)).resolves.toBe(false);
        expect(order.content).toBe("<order/>");
    });

    it("always writes host-initiated content that carries no revision", async () => {
        const { editorStore, order, document } = openEditors();
        const writeContent = vi.spyOn(order, "writeContent");
        editorStore.markHostDocumentUpdated(ORDER_ID);

        await expect(document.write(ORDER_ID, "<migrated/>")).resolves.toBe(true);
        expect(order.content).toBe("<migrated/>");
        expect(writeContent).toHaveBeenCalledWith("<migrated/>", undefined);
    });
});
