import { commands, ExtensionContext, WebviewPanel, window } from "vscode";

import type { DiffPaneHandle, MergePaneCommandService } from "@miragon/bpmn-modeler-core";
import { MERGE_PANE_COMMANDS, type MergePaneCommand } from "@miragon/bpmn-modeler-shared";

export const MERGE_PANE_COMMAND_IDS: Readonly<Record<MergePaneCommand, string>> = {
    keep: "bpmn-modeler.mergeKeepThisSide",
    keepInside: "bpmn-modeler.mergeKeepWithEverythingInside",
    leaveOut: "bpmn-modeler.mergeLeaveOut",
    keepRemovedFlows: "bpmn-modeler.mergeKeepRemovedFlows",
    undo: "bpmn-modeler.mergeUndoPick",
    next: "bpmn-modeler.mergeNextConflict",
    previous: "bpmn-modeler.mergePreviousConflict",
    build: "bpmn-modeler.mergeBuild",
};

/** What a diff pane's controller hands the keyboard: each pane's panel. */
export interface DiffPaneKeyboard {
    watch(panel: WebviewPanel, pane: DiffPaneHandle): void;
}

interface PanelOfPane {
    readonly panel: WebviewPanel;
    readonly pane: DiffPaneHandle;
}

/**
 * The merge panes' keyboard commands in VS Code: one command each, run by
 * the core on its target pane, and the focus as VS Code reports it per side
 * of the diff (`WebviewPanel.active`). A pane whose panel turns inactive
 * while its tab stays shown in the active group lost the focus to no other
 * editor, as to the Command Palette, so it stays the target.
 */
export class MergeKeyboardController implements DiffPaneKeyboard {
    private lastFocused: PanelOfPane | undefined;

    constructor(
        private readonly service: Pick<MergePaneCommandService, "focus" | "blur" | "leave" | "run">,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            ...MERGE_PANE_COMMANDS.map((command) =>
                commands.registerCommand(MERGE_PANE_COMMAND_IDS[command], () =>
                    this.service.run(command),
                ),
            ),
            window.tabGroups.onDidChangeTabGroups(() => this.leaveForAnotherGroup()),
        );
    }

    watch(panel: WebviewPanel, pane: DiffPaneHandle): void {
        panel.onDidChangeViewState(() => this.follow(panel, pane));
        panel.onDidDispose(() => this.leave(pane));
        this.follow(panel, pane);
    }

    private follow(panel: WebviewPanel, pane: DiffPaneHandle): void {
        if (panel.active && panel.visible) {
            this.lastFocused = { panel, pane };
            this.service.focus(pane);
        } else if (panel.visible) {
            this.service.blur(pane);
        } else {
            this.leave(pane);
        }
    }

    // A disposed panel throws on its view state, so a hidden or closed pane is forgotten here.
    private leave(pane: DiffPaneHandle): void {
        if (this.lastFocused?.pane === pane) this.lastFocused = undefined;
        this.service.leave(pane);
    }

    private leaveForAnotherGroup(): void {
        const focused = this.lastFocused;
        if (focused && focused.panel.viewColumn !== window.tabGroups.activeTabGroup.viewColumn) {
            this.lastFocused = undefined;
            this.service.leave(focused.pane);
        }
    }
}
