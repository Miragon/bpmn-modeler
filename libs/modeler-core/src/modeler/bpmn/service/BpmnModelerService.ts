import { BpmnFileQuery, ENGINE_EXECUTION_PLATFORM } from "@miragon/bpmn-modeler-shared";

import { ModelerSession } from "../../../shared/domain/session";
import {
    ExecutionPlatformNotDetectedError,
    isHiddenEditorError,
    UserCancelledError,
} from "../../../shared/domain/errors";
import { getLatestVersion, getVersions } from "../../../shared/domain/engineVersions";
import { BpmnDocument } from "../../../shared/domain/BpmnDocument";
import {
    DocumentPort,
    NotifierPort,
    PickerPort,
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
                const ep = await this.picker.pickExecutionPlatform("Select the engine.", [
                    "c7",
                    "c8",
                ]);
                if (!this.isSnapshotCurrent(editorId, editorSession, documentRevision)) {
                    return false;
                }

                doc = BpmnDocument.empty(ep, getLatestVersion(ep));
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
                const ep = doc.detectPlatform();
                const sent = await this.editorStore.postMessage(
                    editorId,
                    new BpmnFileQuery(doc.xml, ep, "modeler", documentRevision),
                );

                const version = doc.detectPlatformVersion();
                if (version) {
                    this.statusBar.showEngineVersion(ep, version);
                }

                return sent;
            } catch (error) {
                if (isHiddenEditorError(error)) {
                    return false;
                } else if (error instanceof ExecutionPlatformNotDetectedError) {
                    const ep = await this.picker.pickExecutionPlatform(
                        "Select the execution platform.",
                        ["c7", "c8"],
                    );
                    if (!this.isSnapshotCurrent(editorId, editorSession, documentRevision)) {
                        return false;
                    }

                    const latestVersion = getLatestVersion(ep);
                    const newDoc = doc.withExecutionPlatform(
                        ENGINE_EXECUTION_PLATFORM[ep],
                        latestVersion,
                        ep === "c7"
                            ? `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"`
                            : `xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"`,
                    );

                    if (
                        !(await this.writeGuarded(
                            session,
                            editorId,
                            newDoc.xml,
                            documentRevision,
                        )) ||
                        !this.isSnapshotCurrent(editorId, editorSession, documentRevision)
                    ) {
                        return false;
                    }
                    const sent = await this.editorStore.postMessage(
                        editorId,
                        new BpmnFileQuery(newDoc.xml, ep, "modeler", documentRevision),
                    );
                    this.statusBar.showEngineVersion(ep, latestVersion);
                    return sent;
                } else {
                    return this.handleError(error as Error);
                }
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
            const platform = doc.detectPlatform();
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
