import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../editorSession/domain/EditorSessionParticipant";
import { DeploymentStatusService } from "./DeploymentStatusService";

/**
 * Coalescing window for re-rendering the deployment freshness dot on diagram
 * edits — long enough that a burst of keystroke-driven document syncs collapses
 * into a single ledger lookup + status-bar update.
 */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Drives the deployment status-bar dot for a BPMN session: refreshes freshness
 * while the editor is focused, re-evaluates it (debounced) on document edits,
 * and hides the item when the editor loses focus or is disposed.
 *
 * A single instance serves every editor, so the debounce timers are keyed by
 * editorId.
 */
export class DeploymentStatusParticipant implements EditorSessionParticipant {
    private readonly refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(private readonly statusService: DeploymentStatusService) {}

    onResolve(session: EditorSessionContext): void {
        this.statusService.track(session.editorId);
        session.onFocusChange((focused) => {
            if (!focused) {
                this.cancelRefresh(session.editorId);
                this.releaseStatusItem(session);
            } else if (session.claimStatusSlot("deploymentTarget")) {
                void this.statusService.refresh(session.editorId);
            }
        });

        session.onDocumentChange((event) => {
            if (
                session.isFocused() &&
                event.hasContentChanges() &&
                event.documentUriString() === session.editorId
            ) {
                this.scheduleRefresh(session);
            }
        });

        session.onDispose(() => {
            this.cancelRefresh(session.editorId);
            this.statusService.untrack(session.editorId);
            this.releaseStatusItem(session);
        });
        if (session.claimStatusSlot("deploymentTarget")) {
            void this.statusService.refresh(session.editorId);
        }
    }

    private releaseStatusItem(session: EditorSessionContext): void {
        if (session.releaseStatusSlot("deploymentTarget") === "hide") this.statusService.hide();
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
                if (session.isFocused()) void this.statusService.refresh(session.editorId);
            }, REFRESH_DEBOUNCE_MS),
        );
    }
}
