import { BpmnDocument } from "../../../shared/domain/BpmnDocument";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../shared/domain/EditorSessionParticipant";
import { DocumentPort, StatusBarPort } from "../../../shared/domain/hostPorts";
import { StatusItemOwnership } from "../../../shared/domain/StatusItemOwnership";

/**
 * Shows the engine-version status bar item while a BPMN editor is focused and
 * hides it otherwise. Owns the platform/version detection because that is the
 * only consumer of it on the lifecycle path.
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
                this.hideFor(session.editorId);
            }
        });

        session.onDispose(() => this.hideFor(session.editorId));
    }

    private hideFor(editorId: string): void {
        if (this.statusOwnership.release(editorId) === "hide") this.statusBar.hideEngineVersion();
    }

    /**
     * Reads the current document content and updates the engine-version status
     * bar with the detected platform and version.
     */
    private updateEngineVersionStatusBar(editorId: string): void {
        try {
            const doc = new BpmnDocument(this.documents.getContent(editorId));
            if (doc.isEmpty()) {
                return;
            }
            const platform = doc.detectPlatform();
            const version = doc.detectPlatformVersion();
            if (version) {
                this.statusBar.showEngineVersion(platform, version);
            }
        } catch {
            // If detection fails (e.g. no platform yet), hide the status bar.
            this.statusBar.hideEngineVersion();
        }
    }
}
