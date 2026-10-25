import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";

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
import { EditorDocumentSync } from "../../../shared/infrastructure/EditorDocumentSync";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";

/**
 * Displays, initialises and syncs BPMN documents on top of the shared
 * {@link EditorDocumentSync}; adds the engine choice for an empty file and the
 * engine-version status.
 */
export class BpmnModelerService {
    private readonly documents: EditorDocumentSync;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly picker: PickerPort,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
        private readonly settings: SettingsPort,
    ) {
        this.documents = new EditorDocumentSync(editorStore, vsDocument);
    }

    registerSession(editorId: string): void {
        this.documents.register(editorId);
    }

    disposeSession(editorId: string): void {
        this.documents.dispose(editorId);
    }

    async display(editorId: string, hostUpdated = false): Promise<boolean> {
        try {
            const snapshot = this.documents.read(editorId, hostUpdated);
            if (!snapshot) return false;
            let doc = new BpmnDocument(snapshot.content);

            if (doc.isEmpty()) {
                const xml = await this.documents.initializeEmpty(
                    editorId,
                    snapshot,
                    hostUpdated,
                    async () => {
                        const choice = await this.picker.pickNewModelEngine(
                            "Select the execution platform.",
                        );
                        return BpmnDocument.forNewModel(choice).xml;
                    },
                );
                if (xml === undefined) return false;
                doc = new BpmnDocument(xml);
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
                        snapshot.revision,
                        this.settings.getDefaultMode(),
                        this.settings.getLanguage(),
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
        try {
            return await this.documents.sync(editorId, content, documentRevision);
        } catch (error) {
            return this.handleSyncError(error as Error);
        }
    }

    async changeEngineVersion(editorId: string): Promise<boolean> {
        try {
            const snapshot = this.documents.snapshot(editorId);
            const doc = new BpmnDocument(snapshot.content);
            const platform = doc.detectEngine();
            if (!platform) {
                this.notifier.showInfo(
                    "This diagram has no execution platform, so there is no engine version to change.",
                );
                return false;
            }
            const versions = getVersions(platform);

            const newVersion = await this.picker.pickEngineVersion(platform, versions);
            if (!snapshot.isCurrent()) {
                return false;
            }

            const updatedDoc = doc.withVersion(newVersion);
            if (
                !(await this.documents.write(editorId, updatedDoc.xml, snapshot.revision)) ||
                !snapshot.isCurrent()
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
}
