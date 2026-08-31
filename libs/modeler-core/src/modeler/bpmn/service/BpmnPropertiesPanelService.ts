import { PropertiesPanelStateQuery } from "@miragon/bpmn-modeler-shared";

import {
    NotifierPort,
    PropertiesPanelInitialState,
    PropertiesPanelStatePort,
} from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";

/**
 * Owns persisted properties-panel visibility and pushes it to the webview.
 *
 * Reads are synchronous so the webview HTML can be pre-rendered with the
 * correct collapsed state — the async channel push only confirms the value
 * after the webview has booted.
 */
export class BpmnPropertiesPanelService {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly panelStateRepo: PropertiesPanelStatePort,
        private readonly notifier: NotifierPort,
        /**
         * Read per call, not captured, so a settings change takes effect on the
         * next diagram without rebuilding the service. Defaults to `remember`
         * so a host that does not offer the setting keeps the old behaviour.
         */
        private readonly getInitialState: () => PropertiesPanelInitialState = () => "remember",
    ) {}

    /**
     * The visibility a freshly opened webview should start with: the pinned
     * `collapsed` / `open` choice when the user has made one, otherwise the
     * persisted global default.
     */
    private initialVisibility(): boolean {
        const initialState = this.getInitialState();
        if (initialState === "collapsed") {
            return false;
        }
        if (initialState === "open") {
            return true;
        }
        return this.panelStateRepo.getVisibility();
    }

    /**
     * Sync read so the webview HTML can be pre-rendered with the correct
     * collapsed state and the panel never flashes visible before
     * {@link sendPropertiesPanelState} delivers the value over the channel.
     */
    getPersistedPanelVisibility(): boolean {
        return this.initialVisibility();
    }

    async sendPropertiesPanelState(editorId: string): Promise<boolean> {
        try {
            const visible = this.initialVisibility();
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
