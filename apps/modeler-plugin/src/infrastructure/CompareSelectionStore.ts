import { commands, Uri } from "vscode";

/** Context key that gates the "Compare with Selected" menu entry. */
const CONTEXT_KEY = "bpmn-modeler.compareSelectionActive";

/**
 * Holds the URI the user picked via "Select for Compare" until they follow
 * up with "Compare with Selected".
 *
 * In-memory only — selection is ephemeral by design:
 *
 * - Matches the VS Code built-in compare UX (re-selecting is the only way to
 *   refresh the choice, and state never survives a window reload).
 * - Avoids the stale-URI footgun of persisting a file path that may have
 *   been moved, renamed, or deleted between sessions.
 *
 * The store also toggles a VS Code context key so the menu `when` clause can
 * hide the second command until there is something to compare against.
 */
export class CompareSelectionStore {
    private selected?: Uri;

    /** Returns the currently selected URI, or `undefined` when nothing is selected. */
    get(): Uri | undefined {
        return this.selected;
    }

    /**
     * Records `uri` as the left-hand side of the next compare.
     *
     * Also flips the VS Code context key so the "Compare with Selected"
     * explorer-menu entry appears.  Silently overwrites any prior selection
     * — re-selecting is a valid way to change your mind before following up.
     */
    async set(uri: Uri): Promise<void> {
        this.selected = uri;
        await commands.executeCommand("setContext", CONTEXT_KEY, true);
    }

    /**
     * Drops any pending selection.  Called after a successful compare — the
     * VS Code built-in compare UX is one-shot, and we match that.
     */
    async clear(): Promise<void> {
        this.selected = undefined;
        await commands.executeCommand("setContext", CONTEXT_KEY, false);
    }
}
