import { StatusBarAlignment, StatusBarItem, ThemeColor, window } from "vscode";

import {
    StatusAction,
    StatusBarPort,
    StatusIcon,
    StatusSlot,
    StatusTone,
    StatusView,
} from "@miragon/bpmn-modeler-core";

const TRANSIENT_VIEW_VISIBLE_MS = 3000;

// VS Code's guideline: workspace-wide status on the left, the focused file's state on the right.
const SLOT_PLACEMENT: Record<
    StatusSlot,
    { readonly alignment: StatusBarAlignment; readonly priority: number }
> = {
    elementTemplates: { alignment: StatusBarAlignment.Left, priority: 100 },
    engineVersion: { alignment: StatusBarAlignment.Right, priority: 200 },
    bpmnlint: { alignment: StatusBarAlignment.Right, priority: 199 },
    deploymentTarget: { alignment: StatusBarAlignment.Right, priority: 198 },
};

const CODICONS: Record<StatusIcon, string> = {
    loading: "loading~spin",
    check: "check",
    engine: "server-environment",
    warning: "warning",
    shield: "shield",
    off: "circle-slash",
    info: "info",
    dot: "circle-filled",
};

// A status bar item colours its whole text, so an icon and its (short) text share
// one colour — acceptable, and cheaper than a second item.
const TONE_COLORS: Record<StatusTone, { readonly color?: string; readonly background?: string }> = {
    neutral: {},
    success: { color: "testing.iconPassed" },
    attention: { color: "charts.yellow" },
    info: { color: "charts.blue" },
    warning: { background: "statusBarItem.warningBackground" },
};

const ACTION_COMMANDS: Record<StatusAction, string> = {
    changeEngineVersion: "bpmn-modeler.changeEngineVersion",
    toggleLinting: "bpmn-modeler.toggleLinting",
    deploymentMenu: "bpmn-modeler.deploymentStatusMenu",
};

export class VsCodeStatusBar implements StatusBarPort {
    private readonly items = new Map<StatusSlot, StatusBarItem>();

    private readonly pendingAutoHides = new Map<StatusSlot, ReturnType<typeof setTimeout>>();

    show(slot: StatusSlot, view: StatusView): void {
        this.cancelPendingAutoHide(slot);
        const item = this.itemFor(slot);
        const { color, background } = TONE_COLORS[view.tone];
        item.text = view.icon ? `$(${CODICONS[view.icon]}) ${view.text}` : view.text;
        item.tooltip = view.tooltip;
        item.color = color ? new ThemeColor(color) : undefined;
        item.backgroundColor = background ? new ThemeColor(background) : undefined;
        item.command = view.action ? ACTION_COMMANDS[view.action] : undefined;
        item.show();
        if (view.transient) {
            this.pendingAutoHides.set(
                slot,
                setTimeout(() => this.hide(slot), TRANSIENT_VIEW_VISIBLE_MS),
            );
        }
    }

    hide(slot: StatusSlot): void {
        this.cancelPendingAutoHide(slot);
        this.items.get(slot)?.hide();
    }

    // Every show of a slot reuses its item, so a stale timer would hide what a later show put there.
    private cancelPendingAutoHide(slot: StatusSlot): void {
        clearTimeout(this.pendingAutoHides.get(slot));
        this.pendingAutoHides.delete(slot);
    }

    private itemFor(slot: StatusSlot): StatusBarItem {
        let item = this.items.get(slot);
        if (!item) {
            const { alignment, priority } = SLOT_PLACEMENT[slot];
            item = window.createStatusBarItem(alignment, priority);
            this.items.set(slot, item);
        }
        return item;
    }
}
