import { posix } from "path";

import { BpmnlintConfigQuery } from "@miragon/bpmn-modeler-shared";

import { DocumentPort, NotifierPort, StatusBarPort } from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";
import {
    BpmnLintConfigLocator,
    BpmnlintChangeTarget,
} from "../../../shared/service/BpmnLintConfigLocator";

/**
 * Discovers the nearest `.bpmnlintrc` for an open BPMN document and pushes its
 * raw contents to the webview, which owns the resolver and rule allow-list.
 *
 * The host knows config *presence* for free (it does the file walk), so it also
 * drives the status-bar indicator — but never the violation counts, which live
 * in the webview's in-canvas lint button.
 *
 * Filesystem discovery / reading / watching lives in {@link BpmnLintConfigLocator};
 * this service owns the parse, the webview transport, and the status bar.
 * Implements {@link BpmnlintChangeTarget} so the locator's watcher can re-push
 * the config when the file changes on disk.
 */
export class BpmnLintConfigService implements BpmnlintChangeTarget {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly locator: BpmnLintConfigLocator,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
    ) {}

    async setBpmnlintConfig(editorId: string, reflectInStatusBar = true): Promise<boolean> {
        const config = await this.resolveConfig(editorId, reflectInStatusBar);
        return this.pushConfig(editorId, config);
    }

    /**
     * Resolves the effective config for an editor: walks to the nearest
     * `.bpmnlintrc`, parses it, and reflects presence in the status bar.
     *
     * A missing/malformed file must not crash the editor, so a read/parse
     * failure degrades to the no-config state here. This handler is scoped to
     * the filesystem work *only* — transport is pushed apart in
     * {@link pushConfig} — because {@link EditorSessionStore.postMessage}
     * rejects with "The active editor is hidden." when the panel is hidden,
     * the exact state the `.bpmnlintrc` watcher fires in, and that recoverable
     * drop must not be misreported as a read failure.
     */
    private async resolveConfig(
        editorId: string,
        reflectInStatusBar: boolean,
    ): Promise<Record<string, unknown> | null> {
        try {
            const dir = posix.dirname(this.vsDocument.getFilePath(editorId));
            const path = await this.locator.findNearestConfig(dir);
            const config = path
                ? (JSON.parse(await this.locator.readConfig(path)) as Record<string, unknown>)
                : null;
            if (reflectInStatusBar) {
                if (path) {
                    this.statusBar.showBpmnlintActive(path);
                } else {
                    this.statusBar.showBpmnlintNoConfig();
                }
            }
            // Reproduction breadcrumb. `applied` at info; the no-config case fires
            // on every editor open, so it stays debug to keep the trail legible.
            if (path) {
                this.notifier.logInfo(`bpmnlint config applied from ${path}`);
            } else {
                this.notifier.logDebug("No .bpmnlintrc found; linting inactive");
            }
            return config;
        } catch (error) {
            // A malformed .bpmnlintrc must not crash the editor — warn, fall back
            // to the no-config state, and tell the webview to deactivate linting.
            this.notifier.logError(
                new Error(`Failed to read .bpmnlintrc: ${(error as Error).message}`),
            );
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintNoConfig();
            }
            return null;
        }
    }

    /**
     * Posts the resolved config to the webview, the sole config transport.
     *
     * A hidden panel (no `retainContextWhenHidden`) makes `postMessage` reject;
     * the webview re-syncs on reload, so the drop is recoverable. Swallowing it
     * here — at warning level, mirroring `CodeLinkMapService.pushStatus` — keeps
     * fire-and-forget callers from leaking an unhandled rejection, and being the
     * only post means a drop can't trigger a second rejecting fallback push.
     */
    private async pushConfig(
        editorId: string,
        config: Record<string, unknown> | null,
    ): Promise<boolean> {
        try {
            return await this.editorStore.postMessage(editorId, new BpmnlintConfigQuery(config));
        } catch (error) {
            this.notifier.logWarning(`[bpmnlint] config push skipped: ${(error as Error).message}`);
            return false;
        }
    }
}
