import { commands } from "vscode";

import type { MergePaneCommandKeys, MergePaneCommandKeysState } from "@miragon/bpmn-modeler-core";
import { MERGE_PANE_COMMANDS, type MergePaneCommand } from "@miragon/bpmn-modeler-shared";

// A merge pane has the focus: the keybindings act.
export const MERGE_PANE_FOCUSED_KEY = "bpmn-modeler.mergePaneFocused";
// A merge pane is the target, also while the Command Palette has the focus: the palette lists them.
export const MERGE_PANE_TARGETED_KEY = "bpmn-modeler.mergePaneTargeted";

export const MERGE_PANE_COMMAND_KEYS: Readonly<Record<MergePaneCommand, string>> = {
    keep: "bpmn-modeler.mergePane.canKeep",
    keepInside: "bpmn-modeler.mergePane.canKeepInside",
    leaveOut: "bpmn-modeler.mergePane.canLeaveOut",
    keepRemovedWith: "bpmn-modeler.mergePane.canKeepRemovedFlows",
    undo: "bpmn-modeler.mergePane.canUndo",
    next: "bpmn-modeler.mergePane.canStep",
    previous: "bpmn-modeler.mergePane.canStep",
    build: "bpmn-modeler.mergePane.offersBuild",
};

/**
 * Shows the merge panes' keyboard commands through context keys: one per
 * command for what the target pane allows, so a key that does nothing there
 * falls through to VS Code's own binding.
 */
export class VsCodeMergePaneCommandKeys implements MergePaneCommandKeys {
    show({ focused, targeted, available }: MergePaneCommandKeysState): void {
        const values = new Map<string, boolean>([
            [MERGE_PANE_FOCUSED_KEY, focused],
            [MERGE_PANE_TARGETED_KEY, targeted],
        ]);
        for (const command of MERGE_PANE_COMMANDS) {
            const key = MERGE_PANE_COMMAND_KEYS[command];
            values.set(key, values.get(key) === true || available.includes(command));
        }
        for (const [key, value] of values) void commands.executeCommand("setContext", key, value);
    }
}
