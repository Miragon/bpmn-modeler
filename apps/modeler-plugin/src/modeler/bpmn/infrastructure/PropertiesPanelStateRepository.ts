import { ExtensionContext } from "vscode";

// Key used to persist the panel visibility in `context.globalState`.
const PANEL_VISIBLE_KEY = "propertiesPanelVisible";

/**
 * Persists and retrieves the global default visibility of the BPMN properties
 * panel across VS Code sessions.
 *
 * The value stored here is the *default* applied to a freshly opened BPMN
 * webview — it does not override the in-memory state of already-running
 * webviews.  That separation is what allows side-by-side editors to keep
 * independent visibility while still honouring the user's last preference
 * for newly opened diagrams.
 */
export class PropertiesPanelStateRepository {
    /**
     * @param context The VS Code extension context whose `globalState` backs
     *   the persisted value.
     */
    constructor(private readonly context: ExtensionContext) {}

    /**
     * Returns the persisted panel visibility, or `true` when no value has
     * been stored yet.  The default matches the current behaviour of opening
     * a BPMN file with the panel visible.
     */
    getVisibility(): boolean {
        return this.context.globalState.get<boolean>(PANEL_VISIBLE_KEY, true);
    }

    /**
     * Persists `visible` as the new global default.  Returns the underlying
     * `Thenable` so callers can await the write when needed.
     *
     * @param visible `true` to make the panel visible by default, `false` to
     *   collapse it by default.
     */
    setVisibility(visible: boolean): Thenable<void> {
        return this.context.globalState.update(PANEL_VISIBLE_KEY, visible);
    }
}
