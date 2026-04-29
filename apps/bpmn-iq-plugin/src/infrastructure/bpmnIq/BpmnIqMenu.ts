import {
    QuickPickItem,
    QuickPickItemKind,
    window,
} from "vscode";

import type { BpmnIqSyncSnapshot } from "../../domain/bpmnIq/BpmnIqState";
import {
    buildMenuItems,
    type MenuAction,
    type MenuItem,
    menuPlaceholder,
} from "../../domain/bpmnIq/menuItems";

interface MenuPickItem extends QuickPickItem {
    action?: MenuAction;
}

/**
 * VS Code wrapper around {@link buildMenuItems} that renders the quick-pick
 * and returns the selected action (or `null` on dismiss).
 *
 * Single responsibility: bridge the pure menu-data helper to VS Code's
 * `window.showQuickPick`.
 */
export class BpmnIqMenu {
    async show(
        snap: BpmnIqSyncSnapshot,
        daemonUrl: string,
        cloudDaemonUrl: string,
    ): Promise<MenuAction | null> {
        const items = buildMenuItems(snap, daemonUrl, cloudDaemonUrl).map(toQuickPickItem);
        const choice = await window.showQuickPick(items, {
            placeHolder: menuPlaceholder(snap, daemonUrl),
        });
        return choice?.action ?? null;
    }
}

function toQuickPickItem(item: MenuItem): MenuPickItem {
    if (item.separator) {
        return { label: item.label, kind: QuickPickItemKind.Separator };
    }
    return {
        label: item.label,
        description: item.description,
        action: item.action,
    };
}
