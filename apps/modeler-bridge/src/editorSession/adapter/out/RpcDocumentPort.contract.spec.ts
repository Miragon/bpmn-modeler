import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describeDocumentContract } from "@miragon/bpmn-modeler-core/testing";
import { describe, expect, it } from "vitest";

import { addressesSession, intellijDocumentWrite } from "../../../__fixtures__/intellijDocumentWrite";
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

interface DocumentWriteCase {
    readonly name: string;
    readonly document: { readonly text: string; readonly revision: number };
    readonly write: {
        readonly session: "own" | "other" | "none";
        readonly content: string;
        readonly expectedDocumentRevision?: number;
    };
    readonly result: DocumentWriteResult;
    readonly text: string;
}

const DOCUMENT_WRITE_CASES = (
    JSON.parse(
        readFileSync(resolve(__dirname, "../../../__fixtures__/intellijDocumentWrite.cases.json"), "utf8"),
    ) as { cases: DocumentWriteCase[] }
).cases;

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
 * `EditorSessionRouter.kt` does: a write to a Document none is open for is
 * refused, any other as {@link intellijDocumentWrite} answers it. A save
 * reports whether the Document is left saved. An edit outside the core counts
 * a revision; the core's own write does not. An edit the Document fails throws
 * from `setText`, and the host answers the request with the error
 * (`RpcChannel.answerOnce`).
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
        if (!document) return { changed: false, accepted: false };
        const { result, text } = intellijDocumentWrite(
            { sessionId: document.meta.sessionId, text: document.text, documentRevision: document.documentRevision },
            params,
        );
        if (result.changed) {
            if (document.editsFail) throw new Error("The Document did not take the edit.");
            document.text = text;
            document.unsaved = true;
        }
        return result;
    }

    private save(params: DocumentSaveParams): DocumentSaveResult {
        const document = this.documents.get(params.editorId);
        if (!document || !addressesSession(params.sessionId, document.meta.sessionId)) {
            return { saved: false };
        }
        // A veto or a conflict with the file on disk leaves the Document unsaved.
        if (!document.savesFail) document.unsaved = false;
        return { saved: !document.unsaved };
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

describe("intellijDocumentWrite answers the rows EditorSessionRouterTest runs", () => {
    const OWN_SESSION = 1;
    const sessionIdFor = { own: OWN_SESSION, other: OWN_SESSION + 1, none: undefined };

    it.each(DOCUMENT_WRITE_CASES)("$name", ({ document, write, result, text }) => {
        const answer = intellijDocumentWrite(
            { sessionId: OWN_SESSION, text: document.text, documentRevision: document.revision },
            {
                sessionId: sessionIdFor[write.session],
                content: write.content,
                expectedDocumentRevision: write.expectedDocumentRevision,
            },
        );

        expect(answer).toEqual({ result, text });
    });
});
