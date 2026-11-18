import { type MergePaneCommand, RunMergePaneCommandQuery } from "@miragon/bpmn-modeler-shared";

import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { MergePaneCommandKeys } from "../port/MergePaneCommandKeys";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeDecisionService } from "./MergeDecisionService";

/**
 * The merge panes' keyboard commands: what the focused merge pane says its
 * selection, steps and Build allow, and which pane a command runs on. The
 * pane runs it, so the keyboard reaches what the mouse does. A pane that
 * loses the focus to no other editor stays the target, as while the
 * Command Palette is open; only the palette offers the commands then.
 */
export class MergePaneCommandService {
    private readonly reports = new WeakMap<DiffPaneHandle, readonly MergePaneCommand[]>();

    private target: DiffPaneHandle | undefined;

    private focused = false;

    constructor(
        private readonly store: Pick<DiffPaneStore, "sessionOf">,
        private readonly merge: Pick<MergeDecisionService, "shows">,
        private readonly keys: MergePaneCommandKeys,
    ) {}

    /** Takes what a merge pane says its keyboard commands can do now. */
    report(pane: DiffPaneHandle, available: readonly MergePaneCommand[]): void {
        this.reports.set(pane, available);
        if (pane === this.target) this.show();
    }

    /** A diff pane took the focus: a merge pane becomes the target, any other pane leaves none. */
    focus(pane: DiffPaneHandle): void {
        const session = this.store.sessionOf(pane);
        this.target = session && this.merge.shows(session) ? pane : undefined;
        this.focused = this.target !== undefined;
        this.show();
    }

    /** The pane lost the focus to no other editor, so it stays the target. */
    blur(pane: DiffPaneHandle): void {
        if (pane !== this.target) return;
        this.focused = false;
        this.show();
    }

    /** The focus went to another editor, or the pane's tab hid or closed. */
    leave(pane: DiffPaneHandle): void {
        if (pane !== this.target) return;
        this.target = undefined;
        this.focused = false;
        this.show();
    }

    /** Runs a command on the target pane, which decides what it does there. */
    async run(command: MergePaneCommand): Promise<void> {
        await this.target?.postMessage(new RunMergePaneCommandQuery(command));
    }

    private show(): void {
        this.keys.show({
            focused: this.focused,
            targeted: this.target !== undefined,
            available: (this.target && this.reports.get(this.target)) ?? [],
        });
    }
}
