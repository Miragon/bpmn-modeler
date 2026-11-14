import * as vscode from "vscode";
import {
    commands,
    type Disposable,
    EventEmitter,
    type TreeDataProvider,
    TreeItem,
    TreeItemCheckboxState,
    TreeItemCollapsibleState,
    type TreeCheckboxChangeEvent,
    type TreeView,
    window,
} from "vscode";

import type {
    ElementIdReviewGroupView,
    ElementIdReviewPort,
    ElementIdReviewRowView,
    ElementIdReviewView,
} from "@miragon/bpmn-modeler-core";

export const ELEMENT_ID_REVIEW_VIEW = "bpmn-modeler.elementIdReview";
const REVIEW_AVAILABLE_KEY = "bpmn-modeler.elementIdReviewAvailable";
const REVIEW_OPEN_KEY = "bpmn-modeler.elementIdReviewOpen";
const REVIEW_CAN_APPLY_KEY = "bpmn-modeler.elementIdReviewCanApply";

export type ElementIdReviewNode =
    | { readonly group: ElementIdReviewGroupView }
    | { readonly row: ElementIdReviewRowView };

/** The rows a node stands for: the row itself, or every row of a group. */
function rowIdsOf(node: ElementIdReviewNode): string[] {
    return "row" in node ? [node.row.id] : node.group.rows.map((row) => row.id);
}

function rowChanges(
    event: TreeCheckboxChangeEvent<ElementIdReviewNode>,
): [string[], boolean][] {
    const checked = new Set<string>();
    const unchecked = new Set<string>();
    for (const [node, state] of event.items) {
        const ids = state === TreeItemCheckboxState.Checked ? checked : unchecked;
        rowIdsOf(node).forEach((id) => ids.add(id));
    }
    return (
        [
            [[...unchecked], false],
            [[...checked], true],
        ] as [string[], boolean][]
    ).filter(([ids]) => ids.length > 0);
}

function checkboxOf(checked: boolean | undefined): TreeItemCheckboxState | undefined {
    if (checked === undefined) return undefined;
    return checked ? TreeItemCheckboxState.Checked : TreeItemCheckboxState.Unchecked;
}

/**
 * The element ID review in the Panel area beside Problems and Output: a
 * checkbox tree of the view the core builds. Checkbox trees came with VS Code
 * 1.80, so an older VS Code keeps the review in the canvas.
 */
export class VsCodeElementIdReview
    implements ElementIdReviewPort, TreeDataProvider<ElementIdReviewNode>, Disposable
{
    readonly treeView: TreeView<ElementIdReviewNode>;
    private readonly changed = new EventEmitter<void>();
    readonly onDidChangeTreeData = this.changed.event;
    private view: ElementIdReviewView | undefined;

    // 1.76 to 1.79 already export the checkbox API, as a proposal an extension may not use.
    static isSupported(version: string = vscode.version): boolean {
        const [major = 0, minor = 0] = version.split(".").map(Number);
        return major > 1 || (major === 1 && minor >= 80);
    }

    /** @param revealCommand what a click on a row runs, with the element to reveal */
    constructor(private readonly revealCommand: string) {
        // The core's next view sets every checkbox; VS Code would untick a group with a row of it.
        this.treeView = window.createTreeView(ELEMENT_ID_REVIEW_VIEW, {
            treeDataProvider: this,
            manageCheckboxStateManually: true,
        });
        // Generate IDs from Names shows only where this panel can take its review.
        void commands.executeCommand("setContext", REVIEW_AVAILABLE_KEY, true);
    }

    /** Reports each checkbox change as the rows it ticks or unticks; a group's checkbox stands for its rows. */
    onDidChangeChecks(listener: (ids: string[], checked: boolean) => void): Disposable {
        return this.treeView.onDidChangeCheckboxState((event) => {
            for (const [ids, checked] of rowChanges(event)) listener(ids, checked);
        });
    }

    show(view: ElementIdReviewView): void {
        const opening = this.view === undefined;
        this.view = view;
        this.treeView.message = view.message;
        this.treeView.description = view.title;
        const shown = this.setContext(true, view.renameCount > 0);
        this.changed.fire();
        if (opening) {
            // The user asked for the review, so its panel may take the focus.
            void shown.then(() => commands.executeCommand(`${ELEMENT_ID_REVIEW_VIEW}.focus`));
        }
    }

    close(): void {
        if (!this.view) return;
        this.view = undefined;
        this.treeView.message = undefined;
        this.treeView.description = undefined;
        void this.setContext(false, false);
        this.changed.fire();
    }

    getChildren(node?: ElementIdReviewNode): ElementIdReviewNode[] {
        if (!node) return this.view?.groups.map((group) => ({ group })) ?? [];
        return "group" in node ? node.group.rows.map((row) => ({ row })) : [];
    }

    getTreeItem(node: ElementIdReviewNode): TreeItem {
        if ("group" in node) {
            const { group } = node;
            const item = new TreeItem(
                group.label,
                group.collapsed ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded,
            );
            item.id = `group:${group.id}`;
            item.description = String(group.rows.length);
            item.checkboxState = checkboxOf(group.checked);
            return item;
        }
        const { row } = node;
        const item = new TreeItem(row.label, TreeItemCollapsibleState.None);
        item.id = `row:${row.id}`;
        item.description = row.description;
        item.tooltip = row.tooltip;
        item.checkboxState = checkboxOf(row.checked);
        item.command = {
            command: this.revealCommand,
            title: row.tooltip,
            arguments: [row.revealId],
        };
        return item;
    }

    dispose(): void {
        this.treeView.dispose();
        this.changed.dispose();
    }

    private setContext(open: boolean, canApply: boolean): Promise<unknown> {
        return Promise.all([
            commands.executeCommand("setContext", REVIEW_OPEN_KEY, open),
            commands.executeCommand("setContext", REVIEW_CAN_APPLY_KEY, canApply),
        ]);
    }
}
