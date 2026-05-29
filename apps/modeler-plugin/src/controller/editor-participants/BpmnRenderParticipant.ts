import { BpmnModelerService } from "../../service/BpmnModelerService";
import { VsCodeNotifier } from "../../infrastructure/VsCodeNotifier";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../editor-session/EditorSessionParticipant";

/**
 * Owns the BPMN render lifecycle: registers the modeler session, re-renders the
 * diagram on document change, and tears the session down on close.
 */
export class BpmnRenderParticipant implements EditorSessionParticipant {
    constructor(
        private readonly bpmnService: BpmnModelerService,
        private readonly notifier: VsCodeNotifier,
    ) {}

    onResolve(session: EditorSessionContext): void {
        this.bpmnService.registerSession(session.editorId);

        session.onDocumentChange((event) => {
            // Global text-change listener: filter to this session's `.bpmn`
            // document so an edit elsewhere never re-renders this diagram.
            if (
                event.hasContentChanges() &&
                event.documentPath().endsWith(".bpmn") &&
                session.editorId === event.documentUriString()
            ) {
                this.notifier.logInfo("OnDidChangeTextDocument -> display");
                this.bpmnService.display(session.editorId);
            }
        });

        session.onDispose(() => this.bpmnService.disposeSession(session.editorId));
    }
}
