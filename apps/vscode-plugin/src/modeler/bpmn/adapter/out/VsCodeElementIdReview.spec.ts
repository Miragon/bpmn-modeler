import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeFake = vi.hoisted(() => {
    const executed: unknown[][] = [];
    const treeViews: {
        id: string;
        options: { treeDataProvider: unknown; manageCheckboxStateManually?: boolean };
        message: string | undefined;
        description: string | undefined;
        dispose: () => void;
        changeCheckboxes: (items: [unknown, number][]) => void;
        onDidChangeCheckboxState: (
            listener: (event: { items: [unknown, number][] }) => void,
        ) => { dispose(): void };
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
                createTreeView: (
                    id: string,
                    options: { treeDataProvider: unknown; manageCheckboxStateManually?: boolean },
                ) => {
                    let onChange = (_event: { items: [unknown, number][] }) => {};
                    const view = {
                        id,
                        options,
                        message: undefined,
                        description: undefined,
                        dispose: vi.fn(),
                        changeCheckboxes: (items: [unknown, number][]) => onChange({ items }),
                        onDidChangeCheckboxState: (
                            listener: (event: { items: [unknown, number][] }) => void,
                        ) => {
                            onChange = listener;
                            return { dispose: () => undefined };
                        },
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

import { ELEMENT_ID_REVIEW_VIEW, VsCodeElementIdReview } from "./VsCodeElementIdReview";

const REVEAL_ROW = "test.revealRow";

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
    const review = new VsCodeElementIdReview(REVEAL_ROW);
    const [treeView] = vscodeFake.treeViews;
    const provider = treeView!.options.treeDataProvider as VsCodeElementIdReview;
    return { review, treeView: treeView!, provider };
}

beforeEach(() => {
    vscodeFake.executed.length = 0;
    vscodeFake.treeViews.length = 0;
});

describe("VsCodeElementIdReview", () => {
    it.each([
        ["1.80.0", true],
        ["1.146.0", true],
        ["2.0.0", true],
        ["1.79.2", false],
        ["1.76.0", false],
    ])("is offered from VS Code 1.80, where checkbox trees are final: %s", (version, offered) => {
        expect(VsCodeElementIdReview.isSupported(version)).toBe(offered);
    });

    it("draws its tree in the review's panel view, empty until a review opens", () => {
        const { treeView, provider } = setUp();

        expect(treeView.id).toBe(ELEMENT_ID_REVIEW_VIEW);
        expect(provider.getChildren()).toEqual([]);
    });

    // VS Code would otherwise untick a group with one of its rows and report the group too.
    it("leaves the checkboxes to the core's views instead of ticking groups and rows itself", () => {
        const { treeView } = setUp();

        expect(treeView.options.manageCheckboxStateManually).toBe(true);
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
            command: { command: REVEAL_ROW, arguments: ["Activity_1"] },
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

describe("VsCodeElementIdReview.onDidChangeChecks", () => {
    it("reports a row's checkbox as that row, and a group's as all of its rows", () => {
        const { review, treeView } = setUp();
        const [group] = VIEW.groups;
        const changes: [string[], boolean][] = [];
        review.onDidChangeChecks((ids, checked) => changes.push([ids, checked]));

        treeView.changeCheckboxes([[{ row: group!.rows[1]! }, 0]]);
        treeView.changeCheckboxes([[{ group: group! }, 1]]);

        expect(changes).toEqual([
            [["Activity_2"], false],
            [["Activity_1", "Activity_2"], true],
        ]);
    });

    it("sends the unticks of one change before its ticks", () => {
        const { review, treeView } = setUp();
        const [group] = VIEW.groups;
        const changes: [string[], boolean][] = [];
        review.onDidChangeChecks((ids, checked) => changes.push([ids, checked]));

        treeView.changeCheckboxes([
            [{ row: group!.rows[0]! }, 1],
            [{ row: group!.rows[1]! }, 0],
        ]);

        expect(changes).toEqual([
            [["Activity_2"], false],
            [["Activity_1"], true],
        ]);
    });
});
