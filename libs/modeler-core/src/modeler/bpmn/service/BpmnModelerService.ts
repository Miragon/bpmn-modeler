import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { isHiddenEditorError, UserCancelledError } from "../../../kernel/domain/errors";
import { engineVersionPrompt } from "../../../kernel/domain/engineVersions";
import { BpmnDocument } from "../../../kernel/domain/BpmnDocument";
import {
    DocumentPort,
    NotifierPort,
    PickerPort,
    SettingsPort,
    StatusBarPort,
} from "../../../kernel/domain/hostPorts";
import { newModelEnginePrompt } from "../../../kernel/domain/newModelEngine";
import { updateStatusSlot } from "../../../kernel/service/updateStatusSlot";
import { EditorDocumentSync } from "../../../editorSession/service/EditorDocumentSync";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import { engineVersionStatusView } from "../domain/engineVersionStatusView";

const VERSION_NOT_CHANGED =
    "The diagram changed while you picked a version, so its engine version was not changed. Try again.";

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
                const xml = await this.documents.initializeEmpty(editorId, snapshot, async () => {
                    const engine = await this.picker.choose(newModelEnginePrompt());
                    if (engine === undefined) {
                        throw new UserCancelledError();
                    }
                    return BpmnDocument.forNewModel(engine).xml;
                });
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

                this.showEngineVersionIfFocused(editorId, doc);
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
            const newVersion = await this.picker.choose(engineVersionPrompt(platform));
            if (newVersion === undefined) {
                return false;
            }
            if (!snapshot.isCurrent()) {
                this.reportVersionNotChanged(editorId);
                return false;
            }

            const migration = doc.migratedTo(platform, newVersion);
            if (migration.kind === "unchanged") {
                return false;
            }
            if (
                !(await this.documents.writeAndConfirm(
                    editorId,
                    migration.document.xml,
                    snapshot.revision,
                ))
            ) {
                this.reportVersionNotChanged(editorId);
                return false;
            }
            // Written: the change that made the snapshot stale re-renders the editor.
            if (!snapshot.isCurrent()) {
                return false;
            }

            return await this.display(editorId);
        } catch (error) {
            return this.handleError(error as Error);
        }
    }

    // A closed editor leaves nothing to try again.
    private reportVersionNotChanged(editorId: string): void {
        if (this.editorStore.hasEditor(editorId)) {
            this.notifier.showInfo(VERSION_NOT_CHANGED);
        }
    }

    // Every editor shares the engine item: a background render (external edit, split
    // view) or a command run while a text editor is focused must not write it, and
    // the editor can also close mid-post.
    private showEngineVersionIfFocused(editorId: string, doc: BpmnDocument): void {
        if (!this.editorStore.isFocused(editorId)) return;
        updateStatusSlot(
            this.statusBar,
            "engineVersion",
            engineVersionStatusView(doc.engineVersionStatus()),
        );
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
