import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeFake = vi.hoisted(() => {
    const executed: unknown[][] = [];
    const treeViews: {
        id: string;
        options: { treeDataProvider: unknown };
        message: string | undefined;
        description: string | undefined;
        dispose: () => void;
    }[] = [];

    class EventEmitter<T> {
        private listeners: ((value: T) => void)[] = [];
        readonly event = (listener: (value: T) => void) => {
            this.listeners.push(listener);
            return { dispose: () => undefined };
        };
        fire(value: T): void {
            this.listeners.forEach((listener) => listener(value));
        }
        dispose(): void {
            this.listeners = [];
        }
    }

    class TreeItem {
        id?: string;
        description?: string;
        tooltip?: string;
        checkboxState?: number;
        command?: { command: string; title: string; arguments?: unknown[] };
        constructor(
            readonly label: string,
            readonly collapsibleState: number,
        ) {}
    }

    return {
        executed,
        treeViews,
        module: {
            EventEmitter,
            TreeItem,
            TreeItemCheckboxState: { Unchecked: 0, Checked: 1 },
            TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
            window: {
                createTreeView: (id: string, options: { treeDataProvider: unknown }) => {
                    const view = {
                        id,
                        options,
                        message: undefined,
                        description: undefined,
                        dispose: vi.fn(),
                    };
                    treeViews.push(view);
                    return view;
                },
            },
            commands: {
                executeCommand: async (...args: unknown[]) => {
                    executed.push(args);
                },
            },
        },
    };
});

vi.mock("vscode", () => vscodeFake.module);

import type { ElementIdReviewView } from "@miragon/bpmn-modeler-core";

import {
    ELEMENT_ID_REVIEW_VIEW,
    type ElementIdReviewNode,
    REVEAL_ELEMENT_ID_ROW_CMD,
    rowIdsOf,
    VsCodeElementIdReview,
} from "./VsCodeElementIdReview";

const VIEW: ElementIdReviewView = {
    title: "order.bpmn",
    message: "1 of 2 IDs will change.",
    renameCount: 1,
    groups: [
        {
            id: "activity",
            label: "Activities",
            checked: false,
            collapsed: false,
            rows: [
                {
                    id: "Activity_1",
                    label: "Check stock",
                    description: "Activity_1 → serviceTask_checkStock",
                    tooltip: "Check stock: Activity_1 becomes serviceTask_checkStock",
                    checked: true,
                    revealId: "Activity_1",
                },
                {
                    id: "Activity_2",
                    label: "Ship order",
                    description: "Activity_2 → task_shipOrder",
                    tooltip: "Ship order: Activity_2 becomes task_shipOrder",
                    checked: false,
                    revealId: "Activity_2",
                },
            ],
        },
        {
            id: "matches",
            label: "Already match",
            collapsed: true,
            rows: [
                {
                    id: "flow_yes",
                    label: "yes",
                    description: "flow_yes",
                    tooltip: "The ID already follows the name.",
                    revealId: "flow_yes",
                },
            ],
        },
    ],
};

function setUp() {
    const review = new VsCodeElementIdReview();
    const [treeView] = vscodeFake.treeViews;
    const provider = treeView!.options.treeDataProvider as VsCodeElementIdReview;
    return { review, treeView: treeView!, provider };
}

beforeEach(() => {
    vscodeFake.executed.length = 0;
    vscodeFake.treeViews.length = 0;
});

describe("VsCodeElementIdReview", () => {
    it("is offered where VS Code has checkbox trees, from 1.80 on", () => {
        expect(VsCodeElementIdReview.isSupported({ TreeItemCheckboxState: {} })).toBe(true);
        expect(VsCodeElementIdReview.isSupported({})).toBe(false);
    });

    it("draws its tree in the review's panel view, empty until a review opens", () => {
        const { treeView, provider } = setUp();

        expect(treeView.id).toBe(ELEMENT_ID_REVIEW_VIEW);
        expect(provider.getChildren()).toEqual([]);
    });

    it("shows the view's groups and rows with the core's texts and checkboxes", () => {
        const { review, provider } = setUp();

        review.show(VIEW);
        const [activities, matches] = provider.getChildren();
        const [checked, unchecked] = provider.getChildren(activities);

        expect(provider.getTreeItem(activities!)).toMatchObject({
            id: "group:activity",
            label: "Activities",
            description: "2",
            collapsibleState: 2,
            checkboxState: 0,
        });
        expect(provider.getTreeItem(matches!)).toMatchObject({
            collapsibleState: 1,
            checkboxState: undefined,
        });
        expect(provider.getTreeItem(checked!)).toMatchObject({
            id: "row:Activity_1",
            label: "Check stock",
            description: "Activity_1 → serviceTask_checkStock",
            tooltip: "Check stock: Activity_1 becomes serviceTask_checkStock",
            checkboxState: 1,
            collapsibleState: 0,
            command: { command: REVEAL_ELEMENT_ID_ROW_CMD, arguments: ["Activity_1"] },
        });
        expect(provider.getTreeItem(unchecked!).checkboxState).toBe(0);
        expect(provider.getChildren(checked)).toEqual([]);
    });

    it("puts the message and the file name above the tree and refreshes it", () => {
        const { review, treeView, provider } = setUp();
        const refreshed = vi.fn();
        provider.onDidChangeTreeData(refreshed);

        review.show(VIEW);

        expect(treeView.message).toBe("1 of 2 IDs will change.");
        expect(treeView.description).toBe("order.bpmn");
        expect(refreshed).toHaveBeenCalledOnce();
    });

    it("reveals the panel when a review opens, and not again for its later rows", async () => {
        const { review } = setUp();

        review.show(VIEW);
        review.show({ ...VIEW, renameCount: 0 });
        await vi.waitFor(() =>
            expect(vscodeFake.executed).toContainEqual([`${ELEMENT_ID_REVIEW_VIEW}.focus`]),
        );

        expect(vscodeFake.executed).toEqual([
            ["setContext", "bpmn-modeler.elementIdReviewOpen", true],
            ["setContext", "bpmn-modeler.elementIdReviewCanApply", true],
            ["setContext", "bpmn-modeler.elementIdReviewOpen", true],
            ["setContext", "bpmn-modeler.elementIdReviewCanApply", false],
            [`${ELEMENT_ID_REVIEW_VIEW}.focus`],
        ]);
    });

    it("empties and hides the panel when the review is over", async () => {
        const { review, treeView, provider } = setUp();
        review.show(VIEW);
        vscodeFake.executed.length = 0;

        review.close();
        review.close();

        expect(provider.getChildren()).toEqual([]);
        expect(treeView.message).toBeUndefined();
        expect(vscodeFake.executed).toEqual([
            ["setContext", "bpmn-modeler.elementIdReviewOpen", false],
            ["setContext", "bpmn-modeler.elementIdReviewCanApply", false],
        ]);
    });

    it("disposes its tree", () => {
        const { review, treeView } = setUp();

        review.dispose();

        expect(treeView.dispose).toHaveBeenCalledOnce();
    });
});

describe("rowIdsOf", () => {
    it("names a row's own ID, and every row of a group", () => {
        const [group] = VIEW.groups;
        const nodes: ElementIdReviewNode[] = [{ row: group!.rows[0]! }, { group: group! }];

        expect(nodes.map(rowIdsOf)).toEqual([["Activity_1"], ["Activity_1", "Activity_2"]]);
    });
});
