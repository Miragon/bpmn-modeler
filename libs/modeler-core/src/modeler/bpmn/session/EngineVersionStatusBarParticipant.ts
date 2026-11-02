import { BpmnDocument } from "../../../kernel/domain/BpmnDocument";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editorSession/domain/EditorSessionParticipant";
import { DocumentPort, StatusBarPort } from "../../../kernel/domain/hostPorts";
import { updateStatusSlot } from "../../../kernel/service/updateStatusSlot";
import { StatusItemOwnership } from "../../../editorSession/domain/StatusItemOwnership";
import { engineVersionStatusView } from "../domain/engineVersionStatusView";

/**
 * Shows the engine-version status bar item while a BPMN editor is focused and
 * hides it otherwise.
 */
export class EngineVersionStatusBarParticipant implements EditorSessionParticipant {
    private readonly statusOwnership = new StatusItemOwnership();

    constructor(
        private readonly statusBar: StatusBarPort,
        private readonly documents: DocumentPort,
    ) {}

    onResolve(session: EditorSessionContext): void {
        if (session.isFocused()) this.statusOwnership.claim(session.editorId);
        session.onFocusChange((focused) => {
            if (focused) {
                this.statusOwnership.claim(session.editorId);
                this.updateEngineVersionStatusBar(session.editorId);
            } else {
                this.releaseStatusItem(session.editorId);
            }
        });

        session.onDispose(() => this.releaseStatusItem(session.editorId));
    }

    private releaseStatusItem(editorId: string): void {
        if (this.statusOwnership.release(editorId) === "hide") this.statusBar.hide("engineVersion");
    }

    // The claimant must also hide: the previous owner's late blur no longer does.
    private updateEngineVersionStatusBar(editorId: string): void {
        const status = new BpmnDocument(this.documents.getContent(editorId)).engineVersionStatus();
        updateStatusSlot(this.statusBar, "engineVersion", engineVersionStatusView(status));
    }
}
