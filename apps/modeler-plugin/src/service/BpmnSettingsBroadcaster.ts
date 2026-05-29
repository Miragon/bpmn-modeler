import { BpmnModelerSettingQuery, LanguageQuery } from "@miragon/bpmn-modeler-shared";

import { SettingBuilder } from "../domain/model";
import { EditorSessionStore } from "../infrastructure/EditorSessionStore";
import { VsCodeNotifier } from "../infrastructure/VsCodeNotifier";
import { VsCodeSettings } from "../infrastructure/VsCodeSettings";

/**
 * Pushes user-facing modeler settings (toolbar layout, theme, language, …)
 * from VS Code's configuration store into the webview, and subscribes to
 * configuration changes so the webview stays in sync.
 *
 * Owns its own subscription rather than letting the controller dispatch
 * setting branches: every setting routed through here belongs to *this*
 * service, so the fan-out logic lives next to the methods it triggers.
 * The subscription is delivered through {@link EditorSessionStore} as a
 * host-agnostic {@link SettingChange}, so no `vscode` leaks into the service.
 */
export class BpmnSettingsBroadcaster {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsSettings: VsCodeSettings,
        private readonly notifier: VsCodeNotifier,
    ) {}

    async setSettings(editorId: string): Promise<boolean> {
        try {
            const settings = new SettingBuilder()
                .alignToOrigin(this.vsSettings.getAlignToOrigin())
                .showTransactionBoundaries(this.vsSettings.getShowTransactionBoundaries())
                .colorTheme(this.vsSettings.getColorTheme())
                .favouriteBpmnElements(this.vsSettings.getFavouriteBpmnElements())
                .buildBpmnModeler();

            if (
                await this.editorStore.postMessage(
                    editorId,
                    new BpmnModelerSettingQuery({
                        alignToOrigin: settings.alignToOrigin,
                        showTransactionBoundaries: settings.showTransactionBoundaries,
                        colorTheme: settings.colorTheme,
                        favouriteBpmnElements: settings.favouriteBpmnElements,
                    }),
                )
            ) {
                return true;
            } else {
                return this.handleError(new Error("Unable to set preferences."));
            }
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
        const locale = this.vsSettings.getLanguage();
        this.editorStore.postMessage(editorId, new LanguageQuery(locale)).catch((error) => {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
        });
    }

    /**
     * Subscribes to configuration-change events for the editor and forwards
     * relevant setting updates to the webview. Disposal is owned by the
     * editor's disposable bag inside {@link EditorSessionStore}.
     */
    subscribe(editorId: string): void {
        this.editorStore.subscribeToSettingChangeEvent(editorId, (event, id) => {
            if (
                event.affectsConfiguration("miragon.bpmnModeler.alignToOrigin") ||
                event.affectsConfiguration("miragon.bpmnModeler.showTransactionBoundaries") ||
                event.affectsConfiguration("miragon.bpmnModeler.colorTheme") ||
                event.affectsConfiguration("miragon.bpmnModeler.favouriteBpmnElements")
            ) {
                this.setSettings(id);
            }
            if (event.affectsConfiguration("miragon.bpmnModeler.language")) {
                this.setLanguage(id);
            }
        });
    }
}
