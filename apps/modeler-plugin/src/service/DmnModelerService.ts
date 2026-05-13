import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { ModelerSession } from "../domain/session";
import { UserCancelledError } from "../domain/errors";
import { EditorStore } from "../infrastructure/EditorStore";
import { VsCodeDocument } from "../infrastructure/VsCodeDocument";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { EMPTY_DMN_DIAGRAM } from "./bpmnUtils";

/**
 * Application service for the DMN modeler.
 *
 * Owns the per-editor session map for echo-prevention and exposes the two
 * DMN use-case methods (display and sync) that were previously separate classes.
 */
export class DmnModelerService {
    /** Per-editor echo-prevention guard state, keyed by document URI path. */
    private readonly sessions: Map<string, ModelerSession> = new Map();

    /**
     * @param editorStore Central registry for open editor panels and messaging.
     * @param vsDocument Active-document read/write helper.
     * @param vsUI User-facing message and logging helper.
     */
    constructor(
        private readonly editorStore: EditorStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly vsUI: VsCodeUI,
    ) {}

    // ─── Session management ───────────────────────────────────────────────────

    /**
     * Creates and registers a new {@link ModelerSession} for the given editor.
     *
     * @param editorId Document URI path used as the session identifier.
     */
    registerSession(editorId: string): void {
        this.sessions.set(editorId, new ModelerSession(editorId));
    }

    /**
     * Removes the session for the given editor, freeing guard state.
     *
     * @param editorId Document URI path of the editor being closed.
     */
    disposeSession(editorId: string): void {
        this.sessions.delete(editorId);
    }

    // ─── Display ──────────────────────────────────────────────────────────────

    /**
     * Sends the DMN file to the webview for rendering.
     *
     * Returns `false` immediately if the session guard is active (echo
     * prevention — same logic as {@link BpmnModelerService.display}).
     *
     * If the file is empty an empty DMN template is written to disk first.
     *
     * @param editorId Document URI path of the target editor.
     * @returns `true` on success, `false` on any failure.
     */
    async display(editorId: string): Promise<boolean> {
        const session = this.sessions.get(editorId);
        if (session?.isGuarded()) {
            return false;
        }

        try {
            let dmnFile = this.vsDocument.getContent(editorId);

            if (dmnFile === "") {
                dmnFile = EMPTY_DMN_DIAGRAM;
                await this.vsDocument.write(editorId, dmnFile);
                await this.vsDocument.save(editorId);
            }

            return await this.editorStore.postMessage(editorId, new DmnFileQuery(dmnFile));
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            if (error instanceof Error && error.message === "The active editor is hidden.") {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    // ─── Document sync ────────────────────────────────────────────────────────

    /**
     * Writes the XML content received from the webview back to the VS Code
     * text document.
     *
     * Acquires the per-session echo-prevention guard before writing and
     * releases it in the `finally` block.
     *
     * @param editorId Document URI path of the target editor.
     * @param content XML content received from the webview.
     * @returns `true` if the document was changed, `false` if content was identical.
     */
    async sync(editorId: string, content: string): Promise<boolean> {
        const session = this.sessions.get(editorId);
        session?.acquireGuard();
        try {
            return await this.vsDocument.write(editorId, content);
        } catch (error) {
            return this.handleSyncError(error as Error);
        } finally {
            session?.releaseGuard();
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Logs and displays an error from `display`, then returns `false`.
     *
     * @param error The error that occurred.
     */
    private handleError(error: Error): boolean {
        this.vsUI.logError(error);
        this.vsUI.showError(
            `A problem occurred while trying to display the DMN Modeler.\n${error.message ?? error}`,
        );
        return false;
    }

    /**
     * Logs and displays an error from `sync`, then returns `false`.
     *
     * @param error The error that occurred during the document write.
     */
    private handleSyncError(error: Error): boolean {
        this.vsUI.logError(error);
        this.vsUI.showError(
            `A problem occurred while trying to sync the DMN file.\n${error.message}`,
        );
        return false;
    }
}
