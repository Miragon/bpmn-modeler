import { vi } from "vitest";

import { describeDocumentContract, FakeEditorHandle } from "../../testing";
import { EditorSessionDocuments } from "./EditorSessionDocuments";
import { EditorSessionStore } from "./EditorSessionStore";

// The documents of `createTestHost`, the DocumentPort core specs run against.
describeDocumentContract("EditorSessionDocuments over FakeEditorHandle", () => {
    const store = new EditorSessionStore(() => undefined);
    const handles = new Map<string, FakeEditorHandle>();
    const savedContents = new Map<string, string>();
    const handleOf = (editorId: string): FakeEditorHandle => {
        const handle = handles.get(editorId);
        if (!handle) throw new Error(`No editor is open for ${editorId}.`);
        return handle;
    };

    return {
        documents: new EditorSessionDocuments(store),
        open: (path, content) => {
            const handle = new FakeEditorHandle(path, { content });
            handles.set(handle.id, handle);
            savedContents.set(handle.id, content);
            store.register(handle);
            return handle.id;
        },
        editElsewhere: (editorId, content) => {
            handleOf(editorId).changeDocument(content);
            // What the document sync does when it displays a host change.
            store.markHostDocumentUpdated(editorId);
        },
        revision: (editorId) => store.currentHostDocumentRevision(editorId),
        hostContent: (editorId) => handleOf(editorId).content,
        failEdits: (editorId) => {
            vi.spyOn(handleOf(editorId), "writeContent").mockResolvedValue(false);
        },
        failSaves: (editorId) => {
            const handle = handleOf(editorId);
            // The suite fails saves before any save, so the opened text is the saved one.
            vi.spyOn(handle, "save").mockImplementation(
                async () => handle.content === savedContents.get(editorId),
            );
        },
    };
});
