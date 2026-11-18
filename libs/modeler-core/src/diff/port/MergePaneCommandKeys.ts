import type { MergePaneCommand } from "@miragon/bpmn-modeler-shared";

/** What a host's keyboard commands of the merge panes offer now. */
export interface MergePaneCommandKeysState {
    /** A merge pane has the focus, so the commands' keys act. */
    readonly focused: boolean;
    /** A merge pane is the commands' target: it has the focus or lost it to no other editor, as to the Command Palette. */
    readonly targeted: boolean;
    /** What the target's selection, steps and Build allow; empty without a target. */
    readonly available: readonly MergePaneCommand[];
}

/** Where a host shows the merge panes' keyboard commands: the keys and the Command Palette. */
export interface MergePaneCommandKeys {
    show(state: MergePaneCommandKeysState): void;
}
