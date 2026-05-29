import { PropertiesPanelStateQuery } from "@miragon/bpmn-modeler-shared";

import { EditorStore } from "../infrastructure/EditorStore";
import { PropertiesPanelStateRepository } from "../infrastructure/PropertiesPanelStateRepository";
import { VsCodeNotifier } from "../infrastructure/VsCodeNotifier";

/**
 * Owns persisted properties-panel visibility and pushes it to the webview.
 *
 * Reads are synchronous so the webview HTML can be pre-rendered with the
 * correct collapsed state — the async channel push only confirms the value
 * after the webview has booted.
 */
export class BpmnPropertiesPanelService {
    constructor(
        private readonly editorStore: EditorStore,
        private readonly panelStateRepo: PropertiesPanelStateRepository,
        private readonly notifier: VsCodeNotifier,
    ) {}

    /**
     * Sync read so the webview HTML can be pre-rendered with the correct
     * collapsed state and the panel never flashes visible before
     * {@link sendPropertiesPanelState} delivers the value over the channel.
     */
    getPersistedPanelVisibility(): boolean {
        return this.panelStateRepo.getVisibility();
    }

    async sendPropertiesPanelState(editorId: string): Promise<boolean> {
        try {
            const visible = this.panelStateRepo.getVisibility();
            return await this.editorStore.postMessage(
                editorId,
                new PropertiesPanelStateQuery(visible),
            );
        } catch (error) {
            this.notifier.logError(error as Error);
            return false;
        }
    }

    /**
     * Intentionally does not re-broadcast to other open webviews: each
     * webview is authoritative over its own panel, so hiding it in one
     * side-by-side editor must not close it in its neighbour.
     */
    async setPropertiesPanelVisibility(visible: boolean): Promise<void> {
        try {
            await this.panelStateRepo.setVisibility(visible);
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }
}
