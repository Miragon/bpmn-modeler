import { Uri } from "vscode";

import { ScriptVariableManifestService, ScriptVariableStore } from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import {
    EditorSessionContext,
    EditorSessionParticipant,
} from "../../../editor-session/EditorSessionParticipant";

/**
 * Feeds the `*.bpmn.vars.json` manifest model into the {@link ScriptVariableStore}
 * for a BPMN session and keeps it live: loads the manifest on resolve and
 * re-reads it whenever the file is created, edited, or deleted. The store merges
 * it with the webview-extracted model, so script completion reflects authored
 * variables (with their types and docs) on top of the heuristic ones.
 *
 * The `editorId` is a document URI; the manifest service speaks fs paths, so the
 * conversion and the `file:`-scheme guard live here — a `git:`/`untitled:` diff
 * editor has no manifest on disk.
 */
export class ScriptManifestParticipant implements EditorSessionParticipant {
    constructor(
        private readonly manifestSvc: ScriptVariableManifestService,
        private readonly store: ScriptVariableStore,
        private readonly notifier: VsCodeNotifier,
    ) {}

    async onResolve(session: EditorSessionContext): Promise<void> {
        const uri = Uri.parse(session.editorId);
        if (uri.scheme !== "file") {
            return;
        }
        const documentPath = uri.fsPath;
        const { editorId } = session;

        await this.reload(editorId, documentPath);

        session.addDisposable(
            await this.manifestSvc.createWatcher(documentPath, () => {
                void this.reload(editorId, documentPath);
            }),
        );
    }

    /**
     * Re-reads the manifest into the store and logs the resolved lookup path so
     * a mislocated manifest is debuggable. A read error leaves the store
     * untouched and is surfaced as an error notification (fires on session
     * resolve and on every watcher-triggered reload).
     */
    private async reload(editorId: string, documentPath: string): Promise<void> {
        try {
            const { manifestPath, found, variables } =
                await this.manifestSvc.loadWithStatus(documentPath);
            this.store.setManifest(editorId, variables);
            this.notifier.logInfo(
                found
                    ? `Variable manifest loaded: ${manifestPath} (${variables.length} variable(s))`
                    : `No variable manifest at ${manifestPath}`,
            );
        } catch (error) {
            this.notifier.notifyError("Failed to read process-variable manifest", error as Error);
        }
    }
}
