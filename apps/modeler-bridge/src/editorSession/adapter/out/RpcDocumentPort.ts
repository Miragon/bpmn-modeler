import { DocumentPort } from "@miragon/bpmn-modeler-core";
import { Rpc, RpcErrorReply } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { DocumentSaveResult, DocumentWriteResult } from "../../../protocol/domain/types";
import { DocumentMirror } from "../../domain/DocumentMirror";

/** Routes `DocumentPort` calls to the host; serves reads from the {@link DocumentMirror}. */
export class RpcDocumentPort implements DocumentPort {
    constructor(
        private readonly rpc: Rpc,
        private readonly mirror: DocumentMirror,
    ) {}

    getContent(editorId: string): string {
        return this.mirror.content(editorId);
    }

    getFilePath(editorId: string): string {
        return this.mirror.require(editorId).fsPath;
    }

    async write(
        editorId: string,
        content: string,
        expectedDocumentRevision?: number,
    ): Promise<boolean> {
        const sessionId = this.mirror.require(editorId).sessionId;
        let result: DocumentWriteResult | null;
        try {
            result = (await this.rpc.request(METHODS.documentWrite, {
                editorId,
                sessionId,
                content,
                expectedDocumentRevision,
            })) as DocumentWriteResult | null;
        } catch (error) {
            // The host answers an edit its Document failed with an error and logs it.
            if (error instanceof RpcErrorReply) return false;
            throw error;
        }
        return this.mirror.completeWrite(editorId, sessionId, content, result);
    }

    async save(editorId: string): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.documentSave, {
            editorId,
            sessionId: this.mirror.require(editorId).sessionId,
        })) as DocumentSaveResult | null;
        return result?.saved ?? false;
    }
}
