// VS Code's own test in `WorkspaceMergeEditorModeFactory`, not the core's marker grammar: any line
// that starts with it makes the editor replace the result with its own merge.
const OPENING_MARKER = "<<<<<<<";

/**
 * Whether VS Code's merge editor of one element XML merge has finished
 * loading, so that a save reaches it: a tab shows the merge and, for a start
 * the editor merges itself, a tab reports dirty. A merge tab reports dirty
 * only once the editor resolved, and its own merge always leaves the result
 * dirty. A start without markers is not replaced, so its tab showing is all
 * the tab API tells.
 */
export function mergeEditorIsReady(
    start: string,
    shownTabs: readonly { readonly isDirty: boolean }[],
): boolean {
    if (shownTabs.length === 0) return false;
    if (!editorMergesStart(start)) return true;
    return shownTabs.some((tab) => tab.isDirty);
}

function editorMergesStart(start: string): boolean {
    return start.split(/\r\n|\r|\n/).some((line) => line.startsWith(OPENING_MARKER));
}
