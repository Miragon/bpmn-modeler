import { EditorSessionContext, EditorSessionParticipant } from "../domain/EditorSessionParticipant";
import { LoggerPort } from "../domain/hostPorts";
import { ModelerDocumentService } from "../infrastructure/EditorDocumentSync";

/**
 * Owns a modeler editor's render lifecycle: registers the document session,
 * re-renders on a host change to this editor's document, and tears the session
 * down on close.
 */
export class DocumentRenderParticipant implements EditorSessionParticipant {
    /** @param fileExtension The editor's document type, e.g. `.bpmn`. */
    constructor(
        private readonly service: ModelerDocumentService,
        private readonly fileExtension: string,
        private readonly logger: LoggerPort,
    ) {}

    onResolve(session: EditorSessionContext): void {
        this.service.registerSession(session.editorId);

        session.onDocumentChange((event) => {
            // The host's change event is global: filter to this session's
            // document so an edit elsewhere never re-renders this editor.
            if (
                event.hasContentChanges() &&
                event.documentPath().endsWith(this.fileExtension) &&
                session.editorId === event.documentUriString()
            ) {
                this.logger.logDebug(`Document changed -> display ${this.fileExtension}`);
                void this.service.display(session.editorId, true);
            }
        });

        session.onDispose(() => this.service.disposeSession(session.editorId));
    }
}
