import { beforeEach, describe, expect, it, vi } from "vitest";

const vscode = vi.hoisted(() => {
    class Uri {
        constructor(private readonly value: string) {}
        toString(): string {
            return this.value;
        }
    }
    class TabInputCustom {
        constructor(readonly uri: Uri) {}
    }
    class TabInputText {
        constructor(readonly uri: Uri) {}
    }
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const activeTab: { input: unknown } = { input: undefined };
    return {
        Uri,
        TabInputCustom,
        TabInputText,
        handlers,
        activeTab,
        commands: {
            registerCommand: vi.fn((id: string, handler: (...args: unknown[]) => unknown) => {
                handlers.set(id, handler);
                return { dispose: () => handlers.delete(id) };
            }),
        },
        window: { tabGroups: { activeTabGroup: { activeTab } } },
    };
});
vi.mock("vscode", () => vscode);

import { ExtensionContext } from "vscode";

import { RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";
import { MergeController } from "./MergeController";

const ORDER = "file:///repo/order.bpmn";

function registeredController(open = vi.fn(async (_fileUri: string | undefined) => undefined)) {
    new MergeController({ open }, new RecordingNotifier()).register({
        subscriptions: [],
    } as unknown as ExtensionContext);
    const run = (...args: unknown[]) =>
        vscode.handlers.get("bpmn-modeler.openBpmnMergeView")?.(...args);
    return { open, run };
}

beforeEach(() => {
    vscode.handlers.clear();
    vscode.activeTab.input = undefined;
});

describe("MergeController", () => {
    it("opens the merge view of the file a Source Control row names", async () => {
        const { open, run } = registeredController();

        await run({ resourceUri: new vscode.Uri(ORDER) }, [{ resourceUri: new vscode.Uri(ORDER) }]);

        expect(open.mock.calls).toStrictEqual([[ORDER]]);
    });

    it("opens the merge view of the file the editor title names", async () => {
        const { open, run } = registeredController();

        await run(new vscode.Uri(ORDER));

        expect(open.mock.calls).toStrictEqual([[ORDER]]);
    });

    it.each([
        ["a custom editor", () => new vscode.TabInputCustom(new vscode.Uri(ORDER))],
        ["a text editor", () => new vscode.TabInputText(new vscode.Uri(ORDER))],
    ])("opens the merge view of the file in %s from the palette", async (_case, input) => {
        const { open, run } = registeredController();
        vscode.activeTab.input = input();

        await run();

        expect(open.mock.calls).toStrictEqual([[ORDER]]);
    });

    it("leaves the explanation to the core when no file is at hand", async () => {
        const { open, run } = registeredController();

        await run();

        expect(open.mock.calls).toStrictEqual([[undefined]]);
    });

    it("logs a failure instead of rejecting the command", async () => {
        const notifier = new RecordingNotifier();
        new MergeController(
            { open: () => Promise.reject(new Error("git died")) },
            notifier,
        ).register({ subscriptions: [] } as unknown as ExtensionContext);

        await vscode.handlers.get("bpmn-modeler.openBpmnMergeView")?.(new vscode.Uri(ORDER));

        expect(notifier.loggedErrors.map((error) => error.message)).toStrictEqual(["git died"]);
    });
});
