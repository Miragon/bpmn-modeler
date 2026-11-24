import type { MergeSideTitle } from "@miragon/bpmn-modeler-core";

/** One side's title as `_open.mergeEditor` takes it: the title, then the description and the detail beside it. */
export interface MergeEditorInputTitle {
    readonly title: string;
    readonly description?: string;
    readonly detail?: string;
}

// VS Code draws `$(name)` in these texts as an icon; a backslash before it shows the text.
const ICON_SYNTAX = /\$\([A-Za-z0-9-]+(?:~[A-Za-z]+)?\)/g;

/**
 * A side titled as VS Code's Git extension titles its merge editor: the
 * position, the commit beside the commit icon, the branch. The title is also
 * the name in the editor's "Accept …" actions.
 */
export function mergeEditorInputTitle({
    title,
    ref,
    shortHash,
}: MergeSideTitle): MergeEditorInputTitle {
    return {
        title,
        ...(shortHash === undefined ? {} : { description: `$(git-commit) ${shortHash}` }),
        ...(ref === undefined ? {} : { detail: ref.replace(ICON_SYNTAX, "\\$&") }),
    };
}
