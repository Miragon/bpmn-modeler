import { beforeEach, describe, expect, it, vi } from "vitest";

const vscode = vi.hoisted(() => {
    const handlers = new Map<string, () => unknown>();
    const groupListeners: (() => void)[] = [];
    const activeTabGroup = { viewColumn: 1 };
    return {
        handlers,
        groupListeners,
        activeTabGroup,
        commands: {
            registerCommand: vi.fn((id: string, handler: () => unknown) => {
                handlers.set(id, handler);
                return { dispose: () => handlers.delete(id) };
            }),
        },
        window: {
            tabGroups: {
                activeTabGroup,
                onDidChangeTabGroups: vi.fn((listener: () => void) => {
                    groupListeners.push(listener);
                    return { dispose: vi.fn() };
                }),
            },
        },
    };
});
vi.mock("vscode", () => vscode);

import { ExtensionContext, WebviewPanel } from "vscode";

import { FakeDiffPaneHandle } from "@miragon/bpmn-modeler-core/testing";
import type { MergePaneCommand } from "@miragon/bpmn-modeler-shared";
import { MergeKeyboardController } from "./MergeKeyboardController";

/** A merge pane's panel as VS Code reports its view state; `change` fires onDidChangeViewState. */
class FakePanel {
    active = false;
    visible = true;
    private column = 1;
    private disposed = false;
    // VS Code throws on a disposed panel's view state.
    get viewColumn(): number {
        if (this.disposed) throw new Error("Webview is disposed");
        return this.column;
    }
    set viewColumn(column: number) {
        this.column = column;
    }
    private readonly viewStateListeners: (() => void)[] = [];
    private readonly disposeListeners: (() => void)[] = [];
    onDidChangeViewState(listener: () => void) {
        this.viewStateListeners.push(listener);
        return { dispose: vi.fn() };
    }
    onDidDispose(listener: () => void) {
        this.disposeListeners.push(listener);
        return { dispose: vi.fn() };
    }
    change(state: Partial<Pick<FakePanel, "active" | "visible" | "viewColumn">>): void {
        Object.assign(this, state);
        this.viewStateListeners.forEach((listener) => listener());
    }
    close(): void {
        this.disposed = true;
        this.disposeListeners.forEach((listener) => listener());
    }
}

function controller() {
    const calls: string[] = [];
    const named = (pane: FakeDiffPaneHandle) => pane.uri;
    const service = {
        focus: (pane: FakeDiffPaneHandle) => calls.push(`focus ${named(pane)}`),
        blur: (pane: FakeDiffPaneHandle) => calls.push(`blur ${named(pane)}`),
        leave: (pane: FakeDiffPaneHandle) => calls.push(`leave ${named(pane)}`),
        run: async (command: MergePaneCommand) => {
            calls.push(`run ${command}`);
        },
    };
    const keyboard = new MergeKeyboardController(service);
    keyboard.register({ subscriptions: [] } as unknown as ExtensionContext);
    const watch = (uri: string) => {
        const panel = new FakePanel();
        const pane = new FakeDiffPaneHandle(uri);
        keyboard.watch(panel as unknown as WebviewPanel, pane);
        return { panel, pane };
    };
    return { keyboard, calls, watch };
}

beforeEach(() => {
    vscode.handlers.clear();
    vscode.groupListeners.length = 0;
    vscode.activeTabGroup.viewColumn = 1;
});

describe("MergeKeyboardController", () => {
    it.each<[string, MergePaneCommand]>([
        ["bpmn-modeler.mergeKeepThisSide", "keep"],
        ["bpmn-modeler.mergeKeepWithEverythingInside", "keepInside"],
        ["bpmn-modeler.mergeLeaveOut", "leaveOut"],
        ["bpmn-modeler.mergeKeepRemovedFlows", "keepRemovedWith"],
        ["bpmn-modeler.mergeUndoPick", "undo"],
        ["bpmn-modeler.mergeNextConflict", "next"],
        ["bpmn-modeler.mergePreviousConflict", "previous"],
        ["bpmn-modeler.mergeBuild", "build"],
    ])("runs %s as the pane's %s", async (id, command) => {
        const { calls } = controller();

        await vscode.handlers.get(id)?.();

        expect(calls).toStrictEqual([`run ${command}`]);
    });

    it("follows the focus VS Code reports on each pane's panel, as the panel's side", () => {
        const { calls, watch } = controller();
        const current = watch("current");
        const incoming = watch("incoming");

        current.panel.change({ active: true });
        current.panel.change({ active: false });
        incoming.panel.change({ active: true });

        expect(calls).toStrictEqual([
            "blur current",
            "blur incoming",
            "focus current",
            "blur current",
            "focus incoming",
        ]);
    });

    it("leaves the pane once its tab hides or closes", () => {
        const { calls, watch } = controller();
        const { panel } = watch("current");
        calls.length = 0;

        panel.change({ visible: false });
        panel.close();

        expect(calls).toStrictEqual(["leave current", "leave current"]);
    });

    it("leaves the last focused pane once another editor group becomes active, and keeps it while its group stays active", () => {
        const { calls, watch } = controller();
        const { panel } = watch("current");
        panel.change({ active: true });
        calls.length = 0;

        vscode.groupListeners.forEach((listener) => listener());
        vscode.activeTabGroup.viewColumn = 2;
        vscode.groupListeners.forEach((listener) => listener());

        expect(calls).toStrictEqual(["leave current"]);
    });

    it.each([
        ["closed", (panel: FakePanel) => panel.close()],
        ["hidden", (panel: FakePanel) => panel.change({ visible: false })],
    ])(
        "forgets a focused pane once its tab %s, also when another group becomes active",
        (_case, end) => {
            const { calls, watch } = controller();
            const { panel } = watch("current");
            panel.change({ active: true });
            end(panel);
            calls.length = 0;

            vscode.activeTabGroup.viewColumn = 2;
            vscode.groupListeners.forEach((listener) => listener());

            expect(calls).toStrictEqual([]);
        },
    );
});
