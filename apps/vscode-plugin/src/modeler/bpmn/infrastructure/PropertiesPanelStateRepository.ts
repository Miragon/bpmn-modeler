import { ExtensionContext } from "vscode";

import { PropertiesPanelStatePort } from "@miragon/bpmn-modeler-core";

// Default key used to persist the panel visibility in `context.globalState`.
const DEFAULT_PANEL_VISIBLE_KEY = "propertiesPanelVisible";

/**
 * Persists and retrieves the global default visibility of a modeler's
 * properties panel across VS Code sessions.
 *
 * The value stored here is the *default* applied to a freshly opened webview —
 * it does not override the in-memory state of already-running webviews.  That
 * separation is what allows side-by-side editors to keep independent
 * visibility while still honouring the user's last preference for newly opened
 * diagrams.
 *
 * The BPMN and DMN editors each keep their own default under a distinct
 * `globalState` key (see {@link constructor}), so toggling one does not move
 * the other.
 */
export class PropertiesPanelStateRepository implements PropertiesPanelStatePort {
    /**
     * @param context The VS Code extension context whose `globalState` backs
     *   the persisted value.
     * @param key The `globalState` key under which the default is stored.
     *   Defaults to the historical BPMN key so existing BPMN preferences are
     *   preserved; the DMN editor passes its own key.
     */
    constructor(
        private readonly context: ExtensionContext,
        private readonly key: string = DEFAULT_PANEL_VISIBLE_KEY,
    ) {}

    /**
     * Returns the persisted panel visibility, or `true` when no value has
     * been stored yet.  The default matches the current behaviour of opening
     * a file with the panel visible.
     */
    getVisibility(): boolean {
        return this.context.globalState.get<boolean>(this.key, true);
    }

    /**
     * Persists `visible` as the new global default. Wraps VS Code's `Thenable`
     * in a real `Promise` so the return type satisfies the host-agnostic
     * {@link PropertiesPanelStatePort} (the port deliberately avoids the
     * vscode-ambient `Thenable`).
     *
     * @param visible `true` to make the panel visible by default, `false` to
     *   collapse it by default.
     */
    setVisibility(visible: boolean): Promise<void> {
        return Promise.resolve(this.context.globalState.update(this.key, visible));
    }
}
