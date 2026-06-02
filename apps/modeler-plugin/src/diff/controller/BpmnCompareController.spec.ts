import { beforeEach, describe, expect, it, vi } from "vitest";

// Only `register` (commands.registerCommand) and `selectForCompare`
// (window.setStatusBarMessage) reach into vscode; the rest of the controller
// works against injected ports. Hoisting the spies lets the (hoisted)
// `vi.mock` factory close over them while keeping them assertable in tests.
const registerCommandMock = vi.fn();
const setStatusBarMessageMock = vi.fn();
vi.mock("vscode", () => ({
    commands: { registerCommand: (...args: unknown[]) => registerCommandMock(...args) },
    window: { setStatusBarMessage: (...args: unknown[]) => setStatusBarMessageMock(...args) },
}));

import { BpmnCompareController } from "./BpmnCompareController";

/** Minimal vscode `Uri` stand-in carrying the two fields the controller reads. */
function uri(path: string) {
    return { path, toString: () => `file://${path}` } as never;
}

/**
 * Assembles the controller with port doubles so each test can stage the
 * stored selection and assert which collaborator the dispatch reached.
 */
function createController() {
    const selection = { get: vi.fn(), set: vi.fn(), clear: vi.fn() };
    const diffController = { openCompareFilesDiff: vi.fn() };
    const notifier = { showInfo: vi.fn() };
    return {
        controller: new BpmnCompareController(
            selection as never,
            diffController as never,
            notifier as never,
        ),
        selection,
        diffController,
        notifier,
    };
}

beforeEach(() => vi.clearAllMocks());

describe("BpmnCompareController.selectForCompare", () => {
    it("ignores an undefined URI without touching the store", async () => {
        const { controller, selection } = createController();
        await controller.selectForCompare(undefined);
        expect(selection.set).not.toHaveBeenCalled();
        expect(setStatusBarMessageMock).not.toHaveBeenCalled();
    });

    it("ignores a non-.bpmn URI", async () => {
        const { controller, selection } = createController();
        await controller.selectForCompare(uri("/repo/diagram.dmn"));
        expect(selection.set).not.toHaveBeenCalled();
        expect(setStatusBarMessageMock).not.toHaveBeenCalled();
    });

    it("stores the URI and shows a status-bar acknowledgement", async () => {
        const { controller, selection } = createController();
        const target = uri("/repo/diagram.bpmn");
        await controller.selectForCompare(target);
        expect(selection.set).toHaveBeenCalledWith(target);
        // Status message carries the basename so the user sees what was picked.
        expect(setStatusBarMessageMock).toHaveBeenCalledWith(
            "BPMN Modeler: diagram.bpmn selected for compare",
            3_000,
        );
    });
});

describe("BpmnCompareController.compareWithSelected", () => {
    it("ignores a non-.bpmn right-hand URI", async () => {
        const { controller, selection, notifier, diffController } = createController();
        await controller.compareWithSelected(uri("/repo/diagram.dmn"));
        expect(selection.get).not.toHaveBeenCalled();
        expect(notifier.showInfo).not.toHaveBeenCalled();
        expect(diffController.openCompareFilesDiff).not.toHaveBeenCalled();
    });

    it("informs the user when nothing was selected first", async () => {
        const { controller, selection, notifier, diffController } = createController();
        selection.get.mockReturnValue(undefined);
        await controller.compareWithSelected(uri("/repo/right.bpmn"));
        expect(notifier.showInfo).toHaveBeenCalledOnce();
        expect(diffController.openCompareFilesDiff).not.toHaveBeenCalled();
    });

    it("rejects comparing a file with itself", async () => {
        const { controller, selection, notifier, diffController } = createController();
        selection.get.mockReturnValue(uri("/repo/same.bpmn"));
        await controller.compareWithSelected(uri("/repo/same.bpmn"));
        expect(notifier.showInfo).toHaveBeenCalledWith("Cannot compare a file with itself.");
        expect(diffController.openCompareFilesDiff).not.toHaveBeenCalled();
    });

    it("opens the diff then clears the one-shot selection on the happy path", async () => {
        const { controller, selection, diffController } = createController();
        const left = uri("/repo/left.bpmn");
        const right = uri("/repo/right.bpmn");
        selection.get.mockReturnValue(left);
        await controller.compareWithSelected(right);
        expect(diffController.openCompareFilesDiff).toHaveBeenCalledWith(left, right);
        expect(selection.clear).toHaveBeenCalledOnce();
    });
});

describe("BpmnCompareController.compareSelected", () => {
    it("informs the user when the selection is not exactly two .bpmn files", async () => {
        const { controller, notifier, diffController } = createController();
        // A single .bpmn plus a non-.bpmn collapses to one after the filter.
        await controller.compareSelected(undefined, [uri("/repo/a.bpmn"), uri("/repo/b.dmn")]);
        expect(notifier.showInfo).toHaveBeenCalledWith(
            "Select exactly two .bpmn files to compare.",
        );
        expect(diffController.openCompareFilesDiff).not.toHaveBeenCalled();
    });

    it("treats an undefined uris argument as an empty selection", async () => {
        const { controller, notifier, diffController } = createController();
        await controller.compareSelected(undefined, undefined);
        expect(notifier.showInfo).toHaveBeenCalledWith(
            "Select exactly two .bpmn files to compare.",
        );
        expect(diffController.openCompareFilesDiff).not.toHaveBeenCalled();
    });

    it("rejects comparing a file with itself", async () => {
        const { controller, notifier, diffController } = createController();
        const same = uri("/repo/same.bpmn");
        await controller.compareSelected(undefined, [same, same]);
        expect(notifier.showInfo).toHaveBeenCalledWith("Cannot compare a file with itself.");
        expect(diffController.openCompareFilesDiff).not.toHaveBeenCalled();
    });

    it("opens the diff without touching the store on the happy path", async () => {
        const { controller, selection, diffController } = createController();
        const left = uri("/repo/left.bpmn");
        const right = uri("/repo/right.bpmn");
        await controller.compareSelected(undefined, [left, right]);
        expect(diffController.openCompareFilesDiff).toHaveBeenCalledWith(left, right);
        // Single-step path intentionally preserves any pending two-step pick.
        expect(selection.set).not.toHaveBeenCalled();
        expect(selection.clear).not.toHaveBeenCalled();
    });
});
