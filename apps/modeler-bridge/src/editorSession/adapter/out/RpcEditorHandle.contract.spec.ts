import { describeEditorHandleContract } from "@miragon/bpmn-modeler-core/testing";

import { intellijDocumentWrite } from "../../../__fixtures__/intellijDocumentWrite";
import { BridgeSettings } from "../../../kernel/adapter/out/BridgeSettings";
import { METHODS } from "../../../protocol/domain/descriptor";
import {
    DocumentSaveParams,
    DocumentSaveResult,
    DocumentWriteParams,
    DocumentWriteResult,
    EditorPostMessageParams,
    SessionMeta,
} from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { DocumentMirror } from "../../domain/DocumentMirror";
import { RpcEditorHandle } from "./RpcEditorHandle";

const PLUGIN_CACHE = "/idea-system/miragon-bpmn-modeler/bpmn-plugins";

interface Frame {
    readonly id?: number;
    readonly method?: string;
    readonly params?: unknown;
}

/**
 * The IntelliJ host's side of one editor session, answering the core as
 * `EditorSessionRouter.kt` does: a write, with no page flush in flight, as
 * {@link intellijDocumentWrite} answers it; a save reports whether the
 * Document is left saved; a post reaches the session's webview.
 */
class IntelliJEditorSession {
    readonly rpc = new Rpc((line) => this.answer(JSON.parse(line) as Frame));
    readonly delivered: unknown[] = [];
    /** As for a stale session or revision, or a pending external update. */
    refusesWrites = false;
    /** As when a veto or a failed disk write leaves the Document unsaved. */
    refusesSaves = false;
    private documentRevision = 0;
    private unsaved = false;

    constructor(
        readonly meta: SessionMeta,
        private text: string,
    ) {}

    /** The Document changes outside the core; the host counts a revision and sends the text. */
    edit(content: string): string {
        this.text = content;
        this.unsaved = true;
        this.documentRevision++;
        return content;
    }

    private answer({ id, method, params }: Frame): void {
        if (method === METHODS.editorPostMessage) {
            const post = params as EditorPostMessageParams;
            if (this.addresses(post)) this.delivered.push(post.message);
            return;
        }
        const result =
            method === METHODS.documentWrite
                ? this.write(params as DocumentWriteParams)
                : method === METHODS.documentSave
                  ? this.save(params as DocumentSaveParams)
                  : null;
        // Replies arrive on a later read of the host's output.
        queueMicrotask(() => void this.rpc.handleLine(JSON.stringify({ id, result })));
    }

    private write(params: DocumentWriteParams): DocumentWriteResult {
        if (this.refusesWrites) return { changed: false, accepted: false };
        const { result, text } = intellijDocumentWrite(
            { sessionId: this.meta.sessionId, text: this.text, documentRevision: this.documentRevision },
            params,
        );
        if (result.changed) {
            this.text = text;
            this.unsaved = true;
        }
        return result;
    }

    private save(params: DocumentSaveParams): DocumentSaveResult {
        if (this.addresses(params) && !this.refusesSaves) this.unsaved = false;
        return { saved: this.addresses(params) && !this.unsaved };
    }

    private addresses({ sessionId }: { sessionId?: number }): boolean {
        return sessionId === undefined || sessionId === this.meta.sessionId;
    }
}

describeEditorHandleContract("RpcEditorHandle", ({ fileName, content }) => {
    const path = `/work/${fileName}`;
    // `session/register` as the IntelliJ host sends it: the file's URL is the editor id.
    const host = new IntelliJEditorSession(
        {
            editorId: `file://${path}`,
            sessionId: 1,
            uriString: `file://${path}`,
            path,
            fsPath: path,
            scheme: "file",
            workspaceRoot: "/work",
        },
        content,
    );
    const otherPath = "/work/other.bpmn";
    const otherMeta: SessionMeta = {
        ...host.meta,
        editorId: `file://${otherPath}`,
        sessionId: 2,
        uriString: `file://${otherPath}`,
        path: otherPath,
        fsPath: otherPath,
    };
    const mirror = new DocumentMirror();
    mirror.register(host.meta, content);
    mirror.register(otherMeta, content);
    const settings = new BridgeSettings();
    const handle = new RpcEditorHandle(host.meta, mirror, host.rpc, settings, PLUGIN_CACHE);

    // Each control does what the bridge's handler for the host's notification does.
    return {
        handle,
        sendFromWebview: (message) => handle.receive(JSON.parse(JSON.stringify(message))),
        receivedByWebview: () => host.delivered,
        focus: () => handle.setActive(true),
        blur: () => handle.setActive(false),
        editElsewhere: (edited) => mirror.setContent(host.meta.editorId, host.edit(edited)),
        editAnotherDocument: (edited) => mirror.setContent(otherMeta.editorId, edited),
        changeSettings: (values) => settings.apply(values),
        refuseWrites: () => {
            host.refusesWrites = true;
        },
        refuseSaves: () => {
            host.refusesSaves = true;
        },
        close: () => handle.dispose(),
    };
});
