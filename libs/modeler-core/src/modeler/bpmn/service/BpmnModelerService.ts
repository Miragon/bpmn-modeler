import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { ModelerSession } from "../../../shared/domain/session";
import { isHiddenEditorError, UserCancelledError } from "../../../shared/domain/errors";
import { getVersions } from "../../../shared/domain/engineVersions";
import { BpmnDocument } from "../../../shared/domain/BpmnDocument";
import {
    DocumentPort,
    NotifierPort,
    PickerPort,
    SettingsPort,
    StatusBarPort,
} from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";

/**
 * Owns the per-editor {@link ModelerSession} map that drives echo
 * prevention: writes initiated by the webview acquire a guard before the
 * extension writes back, so the resulting `onDidChangeTextDocument` event
 * is skipped by {@link display} instead of being re-rendered.
 */
export class BpmnModelerService {
    private readonly sessions: Map<string, ModelerSession> = new Map();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly picker: PickerPort,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
        private readonly settings: SettingsPort,
    ) {}

    registerSession(editorId: string): void {
        this.sessions.set(editorId, new ModelerSession(editorId));
    }

    disposeSession(editorId: string): void {
        this.sessions.delete(editorId);
    }

    async display(editorId: string, hostUpdated = false): Promise<boolean> {
        try {
            const session = this.sessions.get(editorId);
            const content = this.vsDocument.getContent(editorId);
            if (session?.isGuarded(content)) return false;
            if (hostUpdated) this.editorStore.markHostDocumentUpdated(editorId);
            const documentRevision = this.editorStore.currentHostDocumentRevision(editorId);
            const editorSession = this.editorStore.captureEditorSession(editorId);
            let doc = new BpmnDocument(content);

            if (doc.isEmpty()) {
                const choice = await this.picker.pickNewModelEngine(
                    "Select the execution platform.",
                );
                if (!this.isSnapshotCurrent(editorId, editorSession, documentRevision)) {
                    return false;
                }

                doc = BpmnDocument.forNewModel(choice);
                if (!(await this.writeGuarded(session, editorId, doc.xml, documentRevision))) {
                    return false;
                }
                if (!this.isSnapshotCurrent(editorId, editorSession, documentRevision)) {
                    return false;
                }
                await this.vsDocument.save(editorId);
                if (!this.isSnapshotCurrent(editorId, editorSession, documentRevision)) {
                    return false;
                }
            }

            try {
                // Untagged models are first-class: `detectEngine` returns
                // `undefined` rather than throwing, and the webview routes to
                // Design. The default mode seeds the editor's initial surface.
                const engine = doc.detectEngine();
                const sent = await this.editorStore.postMessage(
                    editorId,
                    new BpmnFileQuery(
                        doc.xml,
                        engine,
                        "modeler",
                        documentRevision,
                        this.settings.getDefaultMode(),
                    ),
                );

                const version = engine ? doc.detectPlatformVersion() : undefined;
                if (engine && version) {
                    this.statusBar.showEngineVersion(engine, version);
                } else {
                    this.statusBar.hideEngineVersion();
                }

                return sent;
            } catch (error) {
                if (isHiddenEditorError(error)) {
                    return false;
                }
                return this.handleError(error as Error);
            }
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    async sync(editorId: string, content: string, documentRevision?: number): Promise<boolean> {
        const session = this.sessions.get(editorId);
        if (!this.editorStore.isHostDocumentRevisionCurrent(editorId, documentRevision)) {
            return false;
        }
        // Guard around the write so the resulting document-change event is
        // recognised as our own echo and not re-rendered.
        try {
            return await this.writeGuarded(session, editorId, content, documentRevision);
        } catch (error) {
            return this.handleSyncError(error as Error);
        }
    }

    async changeEngineVersion(editorId: string): Promise<boolean> {
        try {
            const editorSession = this.editorStore.captureEditorSession(editorId);
            const documentRevision = this.editorStore.currentHostDocumentRevision(editorId);
            const session = this.sessions.get(editorId);
            const doc = new BpmnDocument(this.vsDocument.getContent(editorId));
            const platform = doc.detectEngine();
            if (!platform) {
                this.notifier.showInfo(
                    "This diagram has no execution platform, so there is no engine version to change.",
                );
                return false;
            }
            const versions = getVersions(platform);

            const newVersion = await this.picker.pickEngineVersion(platform, versions);
            if (!this.isSnapshotCurrent(editorId, editorSession, documentRevision)) {
                return false;
            }

            const updatedDoc = doc.withVersion(newVersion);
            if (
                !(await this.writeGuarded(session, editorId, updatedDoc.xml, documentRevision)) ||
                !this.isSnapshotCurrent(editorId, editorSession, documentRevision)
            ) {
                return false;
            }

            this.statusBar.showEngineVersion(platform, newVersion);
            return await this.display(editorId);
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    private handleError(error: Error): boolean {
        this.notifier.notifyError(
            "A problem occurred while trying to display the BPMN Modeler.",
            error,
        );
        return false;
    }

    private handleSyncError(error: Error): boolean {
        this.notifier.notifyError("A problem occurred while trying to sync the BPMN file.", error);
        return false;
    }

    private isSnapshotCurrent(
        editorId: string,
        editorSession: object | undefined,
        documentRevision: number,
    ): boolean {
        return (
            editorSession !== undefined &&
            this.editorStore.isCurrentEditorSession(editorId, editorSession) &&
            this.editorStore.isHostDocumentRevisionCurrent(editorId, documentRevision)
        );
    }

    private async writeGuarded(
        session: ModelerSession | undefined,
        editorId: string,
        content: string,
        documentRevision?: number,
    ): Promise<boolean> {
        session?.acquireGuard(content);
        try {
            return await this.vsDocument.write(editorId, content, documentRevision);
        } finally {
            session?.releaseGuard(content);
        }
    }
}
