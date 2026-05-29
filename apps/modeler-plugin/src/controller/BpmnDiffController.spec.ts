import { beforeEach, describe, expect, it, vi } from "vitest";

// `window.tabGroups.all` is the only vscode value `shouldResolveAsDiff` reads;
// the rest of the named imports are unused on this path. A mutable `tabs`
// array lets each test stage the label heuristic. `vi.hoisted` keeps it usable
// inside the (hoisted) `vi.mock` factory.
const { tabs } = vi.hoisted(() => ({ tabs: [] as { input: unknown; label: string }[] }));
vi.mock("vscode", () => ({
    window: { tabGroups: { all: [{ tabs }] } },
    workspace: { onDidChangeConfiguration: vi.fn() },
    commands: { executeCommand: vi.fn() },
    Uri: { parse: (value: string) => ({ scheme: value.split(":")[0], toString: () => value }) },
}));

import { DiffPaneStore } from "../infrastructure/DiffPaneStore";
import { BpmnDiffController } from "./BpmnDiffController";

/** Minimal vscode `Uri` stand-in carrying the two fields the controller reads. */
function uri(scheme: string, value: string) {
    return { scheme, toString: () => value } as never;
}

function createController() {
    const store = new DiffPaneStore();
    const service = {} as never;
    const notifier = { logError: vi.fn(), showError: vi.fn() } as never;
    return { controller: new BpmnDiffController(store, service, notifier), store };
}

describe("BpmnDiffController.shouldResolveAsDiff", () => {
    beforeEach(() => {
        tabs.length = 0;
    });

    it("returns false when a pane already exists for the URI (second resolve)", () => {
        const { controller, store } = createController();
        const value = "file:///repo/diagram.bpmn";
        const session = store.registerCompareFiles("git:/repo/diagram.bpmn", value);
        session.attachPane({
            uri: value,
            isReady: () => false,
            setReady: vi.fn(),
            getText: () => "",
            postMessage: vi.fn().mockResolvedValue(true),
            dispose: vi.fn(),
        });

        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(false);
    });

    it("returns true for a pre-registered compare-files URI with no pane yet", () => {
        const { controller, store } = createController();
        const value = "file:///repo/diagram.bpmn";
        store.registerCompareFiles("git:/repo/diagram.bpmn", value);

        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(true);
    });

    it("returns true for a Git-provided scheme (git / gitfs)", () => {
        const { controller } = createController();
        expect(controller.shouldResolveAsDiff(uri("git", "git:/repo/a.bpmn"))).toBe(true);
        expect(controller.shouldResolveAsDiff(uri("gitfs", "gitfs:/repo/a.bpmn"))).toBe(true);
    });

    it("falls back to the diff-tab label heuristic for plain file URIs", () => {
        const { controller } = createController();
        const value = "file:///repo/diagram.bpmn";

        // No diff tab open → not a diff.
        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(false);

        // A label-only tab (input undefined) annotated like a diff → diff.
        tabs.push({ input: undefined, label: "diagram.bpmn (Working Tree)" });
        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(true);
    });

    it("ignores tabs that carry an input (regular editors, not diffs)", () => {
        const { controller } = createController();
        const value = "file:///repo/diagram.bpmn";
        tabs.push({ input: {}, label: "diagram.bpmn (Working Tree)" });

        expect(controller.shouldResolveAsDiff(uri("file", value))).toBe(false);
    });
});
