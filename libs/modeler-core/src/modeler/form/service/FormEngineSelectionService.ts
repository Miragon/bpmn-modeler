import { FORM_INVALID_JSON_MESSAGE } from "@miragon/bpmn-modeler-shared";

import { NotifierPort, PickerPort } from "../../../kernel/port/hostPorts";
import { EditorDocumentSync } from "../../../editorSession/service/EditorDocumentSync";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import { PendingEditsFlush } from "../../../editorSession/service/PendingEditsFlush";
import {
    FORM_VERSION_NOT_CHANGED,
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

export class FormEngineSelectionService {
    private readonly selections = new Map<string, object>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly documents: EditorDocumentSync,
        private readonly notifier: NotifierPort,
        private readonly ports: FormEngineSelectionPorts,
        private readonly display: (editorId: string) => Promise<boolean>,
    ) {}

    async changeEngineVersion(editorId: string): Promise<boolean> {
        const session = this.editorStore.captureEditorSession(editorId);
        if (!session || this.selections.get(editorId) === session) return false;
        this.selections.set(editorId, session);
        const isCurrent = () => this.editorStore.isCurrentEditorSession(editorId, session);
        const refuse = () => {
            if (isCurrent()) this.notifier.showInfo(FORM_VERSION_NOT_CHANGED);
            return false;
        };
        let lockedSession: object | undefined;
        try {
            const original = this.documents.snapshot(editorId);
            const current = readFormEngineMetadata(original.content);
            if (!current) {
                if (isCurrent()) this.notifier.showInfo(FORM_INVALID_JSON_MESSAGE);
                return false;
            }
            const platformPrompt = formPlatformPrompt();
            const engine = await this.ports.picker.choose(platformPrompt);
            if (engine === undefined || !platformPrompt.items.some(({ value }) => value === engine))
                return false;
            const version = await this.ports.picker.choose(formVersionPrompt(engine));
            const change = formEngineChange(current, engine, version);
            if (change.kind === "unchanged") return false;
            if (!original.isCurrent()) return refuse();

            // Flush outside the queue: its reply can enqueue a pending visual sync.
            const flushed = await this.ports.pendingEdits.flushIntoDocument(editorId, {
                destructive: true,
            });
            if (flushed.status === "closed") return false;
            if (flushed.status !== "safe") return refuse();
            lockedSession = flushed.session;
            if (flushed.session !== session || !original.isCurrent()) return refuse();
            const baseline = this.documents.snapshot(editorId);
            const metadata = readFormEngineMetadata(baseline.content);
            if (!metadata || !sameFormEngineMetadata(current, metadata)) return refuse();
            const content = this.ports.textEdits.withEngine(baseline.content, change.metadata);
            if (content === undefined) return refuse();

            return (
                (await this.editorStore.runInEditorQueue(editorId, async () => {
                    if (
                        !baseline.isCurrent() ||
                        this.documents.snapshot(editorId).content !== baseline.content
                    )
                        return refuse();
                    if (
                        !(await this.documents.writeAndConfirm(
                            editorId,
                            content,
                            baseline.revision,
                        ))
                    ) {
                        return refuse();
                    }
                    // A confirmed write must not be reported as a refused selection.
                    if (
                        !baseline.isCurrent() ||
                        this.documents.snapshot(editorId).content !== content
                    ) {
                        return false;
                    }
                    this.editorStore.markHostDocumentUpdated(editorId);
                    await this.display(editorId);
                    return true;
                })) ?? false
            );
        } catch (error) {
            if (isCurrent()) {
                this.notifier.notifyError(
                    "A problem occurred while trying to change the form engine version.",
                    error as Error,
                );
            } else {
                this.notifier.logError(error as Error);
            }
            return false;
        } finally {
            if (lockedSession) this.ports.pendingEdits.release(editorId, lockedSession);
            if (this.selections.get(editorId) === session) this.selections.delete(editorId);
        }
    }
}
