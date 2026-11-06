import { describeDocumentContract } from "@miragon/bpmn-modeler-core/testing";

import { METHODS } from "../../../protocol/domain/descriptor";
import {
    DocumentSaveParams,
    DocumentSaveResult,
    DocumentWriteParams,
    DocumentWriteResult,
    SessionMeta,
} from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { DocumentMirror } from "../../domain/DocumentMirror";
import { RpcDocumentPort } from "./RpcDocumentPort";

interface Frame {
    readonly id?: number;
    readonly method?: string;
    readonly params?: unknown;
}

/** One open editor's Document and the session the host registered it with. */
interface IntelliJDocument {
    readonly meta: SessionMeta;
    text: string;
    documentRevision: number;
    unsaved: boolean;
    editsFail: boolean;
    savesFail: boolean;
}

/**
 * The IntelliJ host's open Documents, answering the core as
 * `EditorSessionRouter.kt` does: a write for another session or at a stale
 * revision is refused; otherwise the Document stores LF line endings and the
 * write reports a change only when the text differs, with the stored text when
 * it is not the written one. A save reports whether the Document is left
 * saved. An edit outside the core counts a revision; the core's own write does
 * not. An edit the Document fails throws from `setText`, and the host answers
 * the request with the error (`RpcChannel.answerOnce`). It leaves out the
 * refusal of a write without a revision while a host change has not reached
 * the webview: the loopback has no webview.
 */
class IntelliJDocuments {
    readonly rpc = new Rpc((line) => this.answer(JSON.parse(line) as Frame));
    private readonly documents = new Map<string, IntelliJDocument>();
    private nextSessionId = 1;

    /** `session/register` as the host sends it: the file's URL is the editor id. */
    open(path: string, content: string): SessionMeta {
        const editorId = `file://${path}`;
        const meta: SessionMeta = {
            editorId,
            sessionId: this.nextSessionId++,
            uriString: editorId,
            path,
            fsPath: path,
            scheme: "file",
            workspaceRoot: path.slice(0, path.lastIndexOf("/")),
        };
        this.documents.set(editorId, {
            meta,
            text: content,
            documentRevision: 0,
            unsaved: false,
            editsFail: false,
            savesFail: false,
        });
        return meta;
    }

    /** The Document changes outside the core; resolves the revision `document/didChange` carries. */
    edit(editorId: string, content: string): number {
        const document = this.documentOf(editorId);
        document.text = content;
        document.unsaved = true;
        return ++document.documentRevision;
    }

    text(editorId: string): string {
        return this.documentOf(editorId).text;
    }

    failEdits(editorId: string): void {
        this.documentOf(editorId).editsFail = true;
    }

    failSaves(editorId: string): void {
        this.documentOf(editorId).savesFail = true;
    }

    private answer({ id, method, params }: Frame): void {
        let reply: { id?: number; result?: unknown; error?: string };
        try {
            reply = { id, result: this.resultOf(method, params) };
        } catch (failure) {
            reply = { id, error: (failure as Error).message };
        }
        // Replies arrive on a later read of the host's output.
        queueMicrotask(() => void this.rpc.handleLine(JSON.stringify(reply)));
    }

    private resultOf(method: string | undefined, params: unknown): unknown {
        if (method === METHODS.documentWrite) return this.write(params as DocumentWriteParams);
        if (method === METHODS.documentSave) return this.save(params as DocumentSaveParams);
        return null;
    }

    private write(params: DocumentWriteParams): DocumentWriteResult {
        const document = this.documents.get(params.editorId);
        const content = params.content.replace(/\r\n?/g, "\n");
        if (
            !document ||
            !this.addresses(document, params) ||
            (params.expectedDocumentRevision !== undefined &&
                params.expectedDocumentRevision !== document.documentRevision)
        ) {
            return { changed: false, accepted: false };
        }
        const changed = document.text !== content;
        if (changed) {
            if (document.editsFail) throw new Error("The Document did not take the edit.");
            document.text = content;
            document.unsaved = true;
        }
        const normalizedContent = changed && content !== params.content ? content : undefined;
        return { changed, accepted: true, normalizedContent };
    }

    private save(params: DocumentSaveParams): DocumentSaveResult {
        const document = this.documents.get(params.editorId);
        if (!document || !this.addresses(document, params)) return { saved: false };
        // A veto or a conflict with the file on disk leaves the Document unsaved.
        if (!document.savesFail) document.unsaved = false;
        return { saved: !document.unsaved };
    }

    private addresses(document: IntelliJDocument, { sessionId }: { sessionId?: number }): boolean {
        return sessionId === undefined || sessionId === document.meta.sessionId;
    }

    private documentOf(editorId: string): IntelliJDocument {
        const document = this.documents.get(editorId);
        if (!document) throw new Error(`No Document is open for ${editorId}.`);
        return document;
    }
}

describeDocumentContract("RpcDocumentPort", () => {
    const host = new IntelliJDocuments();
    const mirror = new DocumentMirror();
    const revisions = new Map<string, number>();

    // Each control does what the bridge's handler for the host's notification does.
    return {
        documents: new RpcDocumentPort(host.rpc, mirror),
        open: (path, content) => {
            const meta = host.open(path, content);
            mirror.register(meta, content);
            revisions.set(meta.editorId, 0);
            return meta.editorId;
        },
        editElsewhere: (editorId, content) => {
            revisions.set(editorId, host.edit(editorId, content));
            mirror.setContent(editorId, content);
        },
        revision: (editorId) => revisions.get(editorId) ?? 0,
        hostContent: (editorId) => host.text(editorId),
        failEdits: (editorId) => host.failEdits(editorId),
        failSaves: (editorId) => host.failSaves(editorId),
    };
});
