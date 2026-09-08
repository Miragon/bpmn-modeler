import { DmnModelerSettingQuery, LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { NotifierPort, SettingsPort } from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";

/**
 * Pushes the DMN modeler's color-theme and UI-language preferences into the
 * webview and keeps them in sync when the VS Code configuration changes.
 *
 * Mirrors {@link BpmnSettingsBroadcaster}. The DMN surfaces honour only
 * `colorTheme` among the modeler settings, so `setSettings` carries just that
 * (reusing the shared `miragon.bpmnModeler.colorTheme` config key); the UI
 * language is pushed separately via {@link LanguageQuery}, exactly as BPMN does.
 * The subscription is delivered through {@link EditorSessionStore} as a
 * host-agnostic setting change, so no `vscode` leaks into the service.
 */
export class DmnSettingsBroadcaster {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly settings: SettingsPort,
        private readonly notifier: NotifierPort,
    ) {}

    async setSettings(editorId: string): Promise<boolean> {
        try {
            const posted = await this.editorStore.postMessage(
                editorId,
                new DmnModelerSettingQuery({
                    colorTheme: this.settings.getColorTheme(),
                }),
            );

            return posted ? true : this.handleError(new Error("Unable to set preferences."));
        } catch (error) {
            this.notifier.logError(error as Error);
            return false;
        }
    }

    private handleError(error: Error): boolean {
        this.notifier.notifyError("A problem occurred while applying modeler settings.", error);
        return false;
    }

    setLanguage(editorId: string): void {
        const locale = this.settings.getLanguage();
        this.editorStore.postMessage(editorId, new LanguageQuery(locale)).catch((error) => {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
        });
    }

    /**
     * Subscribes to configuration-change events for the editor and re-pushes the
     * theme or language when either changes. Disposal is owned by the editor's
     * disposable bag inside {@link EditorSessionStore}.
     */
    subscribe(editorId: string): void {
        this.editorStore.subscribeToSettingChangeEvent(editorId, (event, id) => {
            if (event.affectsConfiguration("miragon.bpmnModeler.colorTheme")) {
                // Guard the floating promise: the change listener has no caller
                // to await it (setSettings already logs its own failures).
                this.setSettings(id).catch((error) => {
                    this.notifier.logError(
                        error instanceof Error ? error : new Error(String(error)),
                    );
                });
            }
            if (event.affectsConfiguration("miragon.bpmnModeler.language")) {
                this.setLanguage(id);
            }
        });
    }
}
