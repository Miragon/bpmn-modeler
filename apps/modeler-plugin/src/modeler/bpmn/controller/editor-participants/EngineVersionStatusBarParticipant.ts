import { BpmnDocument } from "../../../../shared/domain/BpmnDocument";
import { VsCodeDocument } from "../../../../shared/infrastructure/VsCodeDocument";
import { VsCodeStatusBar } from "../../../../shared/infrastructure/VsCodeStatusBar";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Shows the engine-version status bar item while a BPMN editor is focused and
 * hides it otherwise. Owns the platform/version detection because that is the
 * only consumer of it on the lifecycle path.
 */
export class EngineVersionStatusBarParticipant implements EditorSessionParticipant {
    constructor(
        private readonly statusBar: VsCodeStatusBar,
        private readonly vsDocument: VsCodeDocument,
    ) {}

    onResolve(session: EditorSessionContext): void {
        const subscription = session.panel.onDidChangeViewState(() => {
            if (session.panel.active) {
                this.updateEngineVersionStatusBar(session.editorId);
            } else {
                this.statusBar.hideEngineVersion();
            }
        });
        // Strict improvement over the former controller, which leaked this
        // listener: join it to the session bag so it dies with the session.
        session.addDisposable(subscription);

        session.onDispose(() => this.statusBar.hideEngineVersion());
    }

    /**
     * Reads the current document content and updates the engine-version status
     * bar with the detected platform and version.
     */
    private updateEngineVersionStatusBar(editorId: string): void {
        try {
            const doc = new BpmnDocument(this.vsDocument.getContent(editorId));
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
