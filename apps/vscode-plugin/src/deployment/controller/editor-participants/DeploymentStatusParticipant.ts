import { DeploymentStatusService } from "@miragon/bpmn-modeler-core";

import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../modeler/editor-session/EditorSessionParticipant";

/**
 * Coalescing window for re-rendering the deployment freshness dot on diagram
 * edits — long enough that a burst of keystroke-driven document syncs collapses
 * into a single ledger lookup + status-bar update.
 */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Drives the deployment status-bar dot for a BPMN session: refreshes freshness
 * while the panel is focused, re-evaluates it (debounced) on document edits, and
 * hides the item when the editor loses focus or is disposed. Mirrors the focus
 * lifecycle of the engine-version and bpmnlint participants.
 *
 * A single instance serves every editor, so the debounce timers are keyed by
 * editorId.
 */
export class DeploymentStatusParticipant implements EditorSessionParticipant {
    private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private focusedEditorId: string | undefined;

    constructor(private readonly statusService: DeploymentStatusService) {}

    onResolve(session: EditorSessionContext): void {
        const subscription = session.panel.onDidChangeViewState(() => {
            if (session.panel.active) {
                this.focusedEditorId = session.editorId;
                void this.statusService.refresh(session.editorId);
            } else {
                this.cancelRefresh(session.editorId);
                this.hideFor(session.editorId);
            }
        });
        session.addDisposable(subscription);

        session.onDocumentChange((event) => {
            if (
                session.panel.active &&
                event.hasContentChanges() &&
                event.documentUriString() === session.editorId
            ) {
                this.scheduleRefresh(session);
            }
        });

        session.onDispose(() => {
            this.cancelRefresh(session.editorId);
            this.hideFor(session.editorId);
        });
        if (session.panel.active) {
            this.focusedEditorId = session.editorId;
            void this.statusService.refresh(session.editorId);
        }
    }

    private hideFor(editorId: string): void {
        if (this.focusedEditorId !== editorId) return;
        this.focusedEditorId = undefined;
        this.statusService.hide();
    }

    private cancelRefresh(editorId: string): void {
        clearTimeout(this.refreshTimers.get(editorId));
        this.refreshTimers.delete(editorId);
    }

    private scheduleRefresh(session: EditorSessionContext): void {
        const existing = this.refreshTimers.get(session.editorId);
        if (existing) {
            clearTimeout(existing);
        }
        this.refreshTimers.set(
            session.editorId,
            setTimeout(() => {
                this.refreshTimers.delete(session.editorId);
                if (session.panel.active) void this.statusService.refresh(session.editorId);
            }, REFRESH_DEBOUNCE_MS),
        );
    }
}
