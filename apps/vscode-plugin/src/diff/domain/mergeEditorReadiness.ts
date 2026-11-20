// VS Code's own test in `WorkspaceMergeEditorModeFactory`, not the core's marker grammar: any line
// that starts with it makes the editor replace the result with its own merge.
const OPENING_MARKER = "<<<<<<<";

/** What one merge editor loads: the result's start text, and whether the editor merges into a copy of it. */
export interface MergeEditorLoad {
    readonly start: string;
    /** The hidden setting `mergeEditor.useWorkingCopy`: the editor merges into a model of its own and leaves the result clean. */
    readonly onWorkingCopy: boolean;
}

/**
 * Whether VS Code's merge editor of one element XML merge has finished
 * loading, so that a save reaches it: a tab shows the merge and, for a start
 * the editor merges into the result itself, a tab reports dirty. A merge tab
 * reports dirty only once the editor resolved, and its merge into the result
 * leaves the result dirty. A start without markers is not replaced, and a
 * working copy leaves the result clean, so there the tab showing is all the
 * tab API tells.
 */
export function mergeEditorIsReady(
    { start, onWorkingCopy }: MergeEditorLoad,
    shownTabs: readonly { readonly isDirty: boolean }[],
): boolean {
    if (shownTabs.length === 0) return false;
    if (onWorkingCopy || !editorMergesStart(start)) return true;
    return shownTabs.some((tab) => tab.isDirty);
}

function editorMergesStart(start: string): boolean {
    return start.split(/\r\n|\r|\n/).some((line) => line.startsWith(OPENING_MARKER));
}
