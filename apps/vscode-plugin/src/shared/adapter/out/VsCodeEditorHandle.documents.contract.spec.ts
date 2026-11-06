import { vi } from "vitest";
import type { TextDocument, WebviewPanel } from "vscode";

import { EditorSessionDocuments, EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { describeDocumentContract } from "@miragon/bpmn-modeler-core/testing";

import { Uri } from "../../../__fixtures__/vscodeFileSystemFake";
import { VsCodeEditorHandle } from "./VsCodeEditorHandle";

interface Replacement {
    readonly uri: Uri;
    readonly range: { readonly start: { offset: number }; readonly end: { offset: number } };
    readonly text: string;
}

// The `workspace.applyEdit` of the fixture's VS Code, set per fixture.
const vscodeHost = vi.hoisted(() => ({
    applyEdit: (_edit: unknown): Promise<boolean> => Promise.resolve(false),
}));

vi.mock("vscode", () => ({
    workspace: {
        applyEdit: (edit: unknown) => vscodeHost.applyEdit(edit),
        fs: { isWritableFileSystem: () => true },
    },
    WorkspaceEdit: class {
        readonly replacements: Replacement[] = [];

        replace(uri: Uri, range: Replacement["range"], text: string): void {
            this.replacements.push({ uri, range, text });
        }
    },
    Range: class {
        constructor(
            readonly start: { offset: number },
            readonly end: { offset: number },
        ) {}
    },
}));

// `create` keeps the panel the bootstrap returns, which is the one VS Code handed over.
vi.mock("./bootstrapWebview", () => ({
    bootstrapWebview: (_viewType: string, panel: unknown) => panel,
}));

/** A `TextDocument` as the handle reads it: VS Code keeps a failed save's document dirty and answers `false`. */
class FakeTextDocument {
    isDirty = false;
    editsFail = false;
    savesFail = false;

    constructor(
        readonly uri: Uri,
        private text: string,
    ) {}

    getText(): string {
        return this.text;
    }

    positionAt(offset: number): { offset: number } {
        return { offset };
    }

    async save(): Promise<boolean> {
        if (this.savesFail) return false;
        this.isDirty = false;
        return true;
    }

    replace(start: number, end: number, text: string): void {
        this.text = this.text.slice(0, start) + text + this.text.slice(end);
        this.isDirty = true;
    }
}

describeDocumentContract("EditorSessionDocuments over VsCodeEditorHandle", () => {
    const store = new EditorSessionStore(() => undefined);
    const textDocuments = new Map<string, FakeTextDocument>();
    const documentOf = (uri: string): FakeTextDocument => {
        const document = textDocuments.get(uri);
        if (!document) throw new Error(`No document is open for ${uri}.`);
        return document;
    };

    // VS Code applies a `WorkspaceEdit` whole or not at all, and answers `false` when it does not.
    vscodeHost.applyEdit = async (edit) => {
        const { replacements } = edit as { replacements: Replacement[] };
        if (replacements.some(({ uri }) => documentOf(uri.toString()).editsFail)) return false;
        for (const { uri, range, text } of replacements) {
            documentOf(uri.toString()).replace(range.start.offset, range.end.offset, text);
        }
        return true;
    };

    return {
        documents: new EditorSessionDocuments(store),
        open: (path, content) => {
            const document = new FakeTextDocument(Uri.file(path), content);
            // The editor id is the document URI, as `ModelerEditorController` names it.
            const editorId = document.uri.toString();
            textDocuments.set(editorId, document);
            const panel = { active: false, visible: true };
            store.register(
                VsCodeEditorHandle.create(
                    "bpmn",
                    editorId,
                    panel as unknown as WebviewPanel,
                    document as unknown as TextDocument,
                ),
            );
            return editorId;
        },
        editElsewhere: (editorId, content) => {
            const document = documentOf(editorId);
            document.replace(0, document.getText().length, content);
            // What the document sync does when it displays VS Code's change event.
            store.markHostDocumentUpdated(editorId);
        },
        revision: (editorId) => store.currentHostDocumentRevision(editorId),
        hostContent: (editorId) => documentOf(editorId).getText(),
        failEdits: (editorId) => {
            documentOf(editorId).editsFail = true;
        },
        failSaves: (editorId) => {
            documentOf(editorId).savesFail = true;
        },
    };
});
