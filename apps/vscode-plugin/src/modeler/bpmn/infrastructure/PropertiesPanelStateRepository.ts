import { ExtensionContext } from "vscode";

import { PropertiesPanelStatePort } from "@miragon/bpmn-modeler-core";

const DEFAULT_PANEL_VISIBLE_KEY = "propertiesPanelVisible";

/**
 * Persists the global default visibility of a modeler's properties panel across
 * VS Code sessions.
 *
 * The stored value is the *default* applied to a freshly opened webview — it
 * does not override the in-memory state of already-running webviews. That
 * separation lets side-by-side editors keep independent visibility while still
 * honouring the user's last preference for newly opened diagrams.
 *
 * BPMN and DMN each pass a distinct `key`, so toggling one does not move the
 * other's default; `key` defaults to the BPMN key.
 */
export class PropertiesPanelStateRepository implements PropertiesPanelStatePort {
    constructor(
        private readonly context: ExtensionContext,
        private readonly key: string = DEFAULT_PANEL_VISIBLE_KEY,
    ) {}

    getVisibility(): boolean {
        return this.context.globalState.get<boolean>(this.key, true);
    }

    /**
     * Wraps VS Code's `Thenable` in a real `Promise` so the return type satisfies
     * the host-agnostic {@link PropertiesPanelStatePort}, which deliberately
     * avoids the vscode-ambient `Thenable`.
     */
    setVisibility(visible: boolean): Promise<void> {
        return Promise.resolve(this.context.globalState.update(this.key, visible));
    }
}
