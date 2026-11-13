import { BpmnDocument } from "../../../kernel/domain/BpmnDocument";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editorSession/domain/EditorSessionParticipant";
import { DocumentPort, StatusBarPort } from "../../../kernel/port/hostPorts";
import { updateStatusSlot } from "../../../kernel/service/updateStatusSlot";
import { engineVersionStatusView } from "../domain/engineVersionStatusView";

/**
 * Shows the engine-version status bar item while a BPMN editor is focused and
 * hides it otherwise.
 */
export class EngineVersionStatusBarParticipant implements EditorSessionParticipant {
    constructor(
        private readonly statusBar: StatusBarPort,
        private readonly documents: DocumentPort,
    ) {}

    onResolve(session: EditorSessionContext): void {
        session.claimStatusSlot("engineVersion");
        session.onFocusChange((focused) => {
            if (!focused) {
                this.releaseStatusItem(session);
            } else if (session.claimStatusSlot("engineVersion")) {
                this.updateEngineVersionStatusBar(session.editorId);
            }
        });

        session.onDispose(() => this.releaseStatusItem(session));
    }

    private releaseStatusItem(session: EditorSessionContext): void {
        if (session.releaseStatusSlot("engineVersion") === "hide")
            this.statusBar.hide("engineVersion");
    }

    // The claimant must also hide: the previous owner's late blur no longer does.
    private updateEngineVersionStatusBar(editorId: string): void {
        const status = new BpmnDocument(this.documents.getContent(editorId)).engineVersionStatus();
        updateStatusSlot(this.statusBar, "engineVersion", engineVersionStatusView(status));
    }
}
