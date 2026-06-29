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
            return this.editorStore.postMessage(editorId, new BpmnlintConfigQuery(config));
        } catch (error) {
            // A malformed .bpmnlintrc must not crash the editor — warn, fall back
            // to the no-config state, and tell the webview to deactivate linting.
            this.notifier.logError(
                new Error(`Failed to read .bpmnlintrc: ${(error as Error).message}`),
            );
            if (reflectInStatusBar) {
                this.statusBar.showBpmnlintNoConfig();
            }
            return this.editorStore.postMessage(editorId, new BpmnlintConfigQuery(null));
        }
    }
}
