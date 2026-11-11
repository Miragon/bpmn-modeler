import { FORM_INVALID_JSON_MESSAGE, FormFileQuery } from "@miragon/bpmn-modeler-shared";

import { UserCancelledError } from "../../../kernel/domain/errors";
import { DocumentPort, NotifierPort, PickerPort } from "../../../kernel/port/hostPorts";
import { EditorDocumentSync } from "../../../editorSession/service/EditorDocumentSync";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import { PendingEditsFlush } from "../../../editorSession/service/PendingEditsFlush";
import { createEmptyForm } from "../domain/emptyForm";
import {
    formEngineChange,
    formPlatformPrompt,
    formVersionPrompt,
    readFormEngineMetadata,
    sameFormEngineMetadata,
} from "../domain/formEngine";
import { FormTextEdits } from "../port/FormTextEdits";

export interface FormEngineSelectionPorts {
    readonly picker: PickerPort;
    readonly pendingEdits: PendingEditsFlush;
    readonly textEdits: FormTextEdits;
}

export class FormModelerService {
    private readonly documents: EditorDocumentSync;
    private readonly selections = new Map<string, object>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        document: DocumentPort,
        private readonly notifier: NotifierPort,
        private readonly selection?: FormEngineSelectionPorts,
    ) {
        this.documents = new EditorDocumentSync(editorStore, document);
    }

    registerSession(editorId: string): void {
        this.documents.register(editorId);
    }

    disposeSession(editorId: string): void {
        this.documents.dispose(editorId);
    }

    async changeEngineVersion(editorId: string): Promise<boolean> {
        const ports = this.selection;
        const session = this.editorStore.captureEditorSession(editorId);
        if (!ports || !session || this.selections.get(editorId) === session) return false;
        this.selections.set(editorId, session);
        let lockedSession: object | undefined;
        try {
            const original = this.documents.snapshot(editorId);
            const current = readFormEngineMetadata(original.content);
            if (!current) {
                this.notifier.showInfo(FORM_INVALID_JSON_MESSAGE);
                return false;
            }
            const engine = await ports.picker.choose(formPlatformPrompt());
            if (engine === undefined) return false;
            const version = await ports.picker.choose(formVersionPrompt(engine));
            const change = formEngineChange(current, engine, version);
            if (change.kind === "unchanged") return false;
            if (!original.isCurrent()) return false;

            // Flush outside the queue: its reply can enqueue a pending visual sync.
            const flushed = await ports.pendingEdits.flushIntoDocument(editorId, {
                destructive: true,
            });
            if (flushed.status !== "safe") return false;
            lockedSession = flushed.session;
            if (flushed.session !== session || !original.isCurrent()) return false;
            const baseline = this.documents.snapshot(editorId);
            const metadata = readFormEngineMetadata(baseline.content);
            if (!metadata || !sameFormEngineMetadata(current, metadata)) return false;
            const content = ports.textEdits.withEngine(baseline.content, change.metadata);
            if (content === undefined) return false;

            return (
                (await this.editorStore.runInEditorQueue(editorId, async () => {
                    if (
                        !baseline.isCurrent() ||
                        this.documents.snapshot(editorId).content !== baseline.content
                    )
                        return false;
                    if (
                        !(await this.documents.writeAndConfirm(
                            editorId,
                            content,
                            baseline.revision,
                        ))
                    )
                        return false;
                    if (
                        !baseline.isCurrent() ||
                        this.documents.snapshot(editorId).content !== content
                    )
                        return false;
                    this.editorStore.markHostDocumentUpdated(editorId);
                    await this.display(editorId);
                    return true;
                })) ?? false
            );
        } catch (error) {
            this.notifier.notifyError(
                "A problem occurred while trying to change the form engine version.",
                error as Error,
            );
            return false;
        } finally {
            if (lockedSession) ports.pendingEdits.release(editorId, lockedSession);
            if (this.selections.get(editorId) === session) this.selections.delete(editorId);
        }
    }

    async display(editorId: string, hostUpdated = false): Promise<boolean> {
        try {
            const snapshot = this.documents.read(editorId, hostUpdated);
            if (!snapshot) return false;
            let content: string | undefined = snapshot.content;
            if (content === "") {
                content = await this.documents.initializeEmpty(editorId, snapshot, createEmptyForm);
                if (content === undefined) return false;
            }
            const outcome = await this.editorStore.postUnlessHidden(
                editorId,
                new FormFileQuery(content, snapshot.revision),
            );
            return outcome === "sent";
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            this.notifier.notifyError(
                "A problem occurred while trying to display the Form Editor.",
                error as Error,
            );
            return false;
        }
    }

    async sync(editorId: string, content: string, documentRevision?: number): Promise<boolean> {
        try {
            return await this.documents.sync(editorId, content, documentRevision);
        } catch (error) {
            this.notifier.notifyError(
                "A problem occurred while trying to sync the form file.",
                error as Error,
            );
            return false;
        }
    }
}
