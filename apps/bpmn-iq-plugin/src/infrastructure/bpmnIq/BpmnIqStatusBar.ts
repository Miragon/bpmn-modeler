import {
    Disposable,
    MarkdownString,
    StatusBarAlignment,
    StatusBarItem,
    commands,
    window,
} from "vscode";

import type { BpmnIqSyncSnapshot } from "../../domain/bpmnIq/BpmnIqState";
import { buildSyncTooltipMarkdown } from "../../domain/bpmnIq/tooltipText";

const CTX_ACTIVE = "miragon.bpmnIq.active";

/**
 * Owns the bpmn-iq status-bar item.
 *
 * Single responsibility: turn a {@link BpmnIqSyncSnapshot} into status-bar
 * text + tooltip + the `miragon.bpmnIq.active` setContext flag.  The
 * controller calls {@link render} on every state change; everything else
 * (commands, menu, lifecycle) lives elsewhere.
 */
export class BpmnIqStatusBar implements Disposable {
    private item: StatusBarItem;

    /**
     * @param clickCommandId Command ID that fires when the user clicks the
     *   status-bar item.  Wired by the controller (typically the
     *   "showMenu" command).
     * @param getDaemonUrl Lazy daemon-URL accessor — re-read on each
     *   render so a settings change is reflected without a manual refresh.
     */
    constructor(
        clickCommandId: string,
        private readonly getDaemonUrl: () => string,
    ) {
        this.item = window.createStatusBarItem(StatusBarAlignment.Right, 100);
        this.item.command = clickCommandId;
        this.item.show();
    }

    render(snap: BpmnIqSyncSnapshot): void {
        void commands.executeCommand("setContext", CTX_ACTIVE, snap.status !== "off");

        switch (snap.status) {
            case "off":
                this.item.text = "$(plug) bpmn-iq";
                this.item.tooltip = "Click to start bpmn-iq sync";
                break;
            case "connecting":
                this.item.text = "$(sync~spin) bpmn-iq: connecting…";
                this.item.tooltip = `Connecting to ${snap.detail ?? "daemon"}`;
                break;
            case "syncing": {
                const count = snap.modelCount ?? 0;
                this.item.text = `$(radio-tower) bpmn-iq: ${count} model${count === 1 ? "" : "s"}`;
                const md = new MarkdownString(undefined, true);
                md.appendMarkdown(buildSyncTooltipMarkdown(snap, this.getDaemonUrl()));
                this.item.tooltip = md;
                break;
            }
            case "error":
                this.item.text = "$(warning) bpmn-iq: disconnected";
                this.item.tooltip = snap.detail ?? "Connection failed";
                break;
        }
    }

    dispose(): void {
        this.item.dispose();
    }
}
