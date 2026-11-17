import { commands, Uri } from "vscode";

import { MergeCommandAvailability } from "@miragon/bpmn-modeler-core";

const RESOLVABLE_CONFLICTS_KEY = "bpmn-modeler.resolvableBpmnConflicts";
const HAS_RESOLVABLE_CONFLICTS_KEY = "bpmn-modeler.hasResolvableBpmnConflicts";

/**
 * Shows "Resolve in BPMN Merge View" through two context keys set from one
 * list: the list itself for `resource in …` in the editor title and the
 * palette, and whether it is empty for the Source Control row, whose `when`
 * clause cannot tell one row's resource from the active editor's.
 */
export class VsCodeMergeCommandAvailability implements MergeCommandAvailability {
    setResolvable(fileUris: readonly string[]): void {
        // `Uri` objects, as Git sets `git.mergeChanges`; VS Code compares them as strings.
        void commands.executeCommand(
            "setContext",
            RESOLVABLE_CONFLICTS_KEY,
            fileUris.map((fileUri) => Uri.parse(fileUri)),
        );
        void commands.executeCommand("setContext", HAS_RESOLVABLE_CONFLICTS_KEY, fileUris.length > 0);
    }
}
