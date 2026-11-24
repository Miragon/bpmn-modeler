import { afterEach, describe, expect, it, vi } from "vitest";
import ContextPadModule from "diagram-js/lib/features/context-pad";

import {
    COLLAPSED_SUBPROCESS_AFTER_XML,
    COLLAPSED_SUBPROCESS_BEFORE_XML,
} from "../__fixtures__/collapsedSubprocessDiff";
import {
    destroyPanes,
    getDiService,
    getServices,
    openPane,
    openSelectablePane,
    selectedIds,
} from "../__fixtures__/diffPane";
import { removeMounts } from "../../__fixtures__/surfaceMount";

afterEach(() => {
    destroyPanes();
    removeMounts();
});

describe("DiffViewer selection", () => {
    it("reports the element the user selects", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        selection.select(registry.get("Top_Task"));

        expect(onSelectedElementChanged.mock.calls).toEqual([["Top_Task"]]);
    });

    it("reports a selected label as the element it labels", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        const { canvas } = getServices(viewer);
        canvas.setRootElement(canvas.findRoot(registry.get("Inner_Flow"))!);
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        selection.select(registry.get("Inner_Flow_label"));

        expect(onSelectedElementChanged.mock.calls).toEqual([["Inner_Flow"]]);
    });

    it("reports an empty and a multiple selection as no element", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        selection.select([registry.get("Top_Task"), registry.get("Main_Subprocess")]);
        selection.select(null);

        expect(onSelectedElementChanged.mock.calls).toEqual([[undefined], [undefined]]);
    });

    it("reports no selection the pane drops by entering a plane itself", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        selection.select(registry.get("Top_Task"));
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        viewer.showPlane("Main_Subprocess");

        expect(onSelectedElementChanged).not.toHaveBeenCalled();
    });

    it("reports no empty selection while a diagram is imported", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        selection.select(registry.get("Top_Task"));
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        await viewer.importXML(COLLAPSED_SUBPROCESS_AFTER_XML);

        expect(onSelectedElementChanged).not.toHaveBeenCalled();
    });

    it("reports no empty selection while the first diagram is imported", async () => {
        const { viewer } = openPane();
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        await viewer.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML);

        expect(onSelectedElementChanged).not.toHaveBeenCalled();
    });

    it("stops reporting once unsubscribed", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        const onSelectedElementChanged = vi.fn();
        const dispose = viewer.onSelectedElementChanged(onSelectedElementChanged);

        dispose();
        selection.select(registry.get("Top_Task"));

        expect(onSelectedElementChanged).not.toHaveBeenCalled();
    });

    it("mirrors the partner's element without reporting it back", async () => {
        const { viewer, selection } = await openSelectablePane();
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        expect(viewer.mirrorSelection("Top_Task")).toBe(true);

        expect(selectedIds(selection)).toEqual(["Top_Task"]);
        expect(onSelectedElementChanged).not.toHaveBeenCalled();
    });

    it.each([
        ["the element", "Top_Task", "Top_Task"],
        ["its label", "Inner_Flow_label", "Inner_Flow"],
    ])(
        "leaves %s selected already as it is, so diagram-js rebuilds no context pad",
        async (_case, selectedId, elementId) => {
            const { viewer, selection, registry } = await openSelectablePane();
            const { canvas } = getServices(viewer);
            canvas.setRootElement(canvas.findRoot(registry.get(selectedId))!);
            selection.select(registry.get(selectedId));
            const selectionChanged = vi.fn();
            getDiService<{ on(event: string, listener: () => void): void }>(viewer, "eventBus").on(
                "selection.changed",
                selectionChanged,
            );

            expect(viewer.mirrorSelection(elementId)).toBe(true);

            expect(selectedIds(selection)).toEqual([selectedId]);
            expect(selectionChanged).not.toHaveBeenCalled();
        },
    );

    it("selects an element on the sub-process plane its focus entered, without reporting it", async () => {
        const { viewer, selection } = await openSelectablePane();
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        expect(viewer.focusElement("Inner_Task")).toBe(true);
        expect(viewer.mirrorSelection("Inner_Task")).toBe(true);

        expect(selectedIds(selection)).toEqual(["Inner_Task"]);
        expect(onSelectedElementChanged).not.toHaveBeenCalled();
    });

    it.each([
        ["the partner selected nothing", undefined, true],
        ["the partner's element is not in this version", "After_Only_Inner", false],
        ["the partner's element is on a plane this pane does not show", "Inner_Task", false],
    ])(
        "clears its selection without reporting it when %s",
        async (_case, partnerElementId, mirrored) => {
            const { viewer, selection, registry } = await openSelectablePane();
            selection.select(registry.get("Top_Task"));
            const onSelectedElementChanged = vi.fn();
            viewer.onSelectedElementChanged(onSelectedElementChanged);

            expect(viewer.mirrorSelection(partnerElementId)).toBe(mirrored);

            expect(selectedIds(selection)).toEqual([]);
            expect(onSelectedElementChanged).not.toHaveBeenCalled();
        },
    );
});

describe("DiffViewer step selection", () => {
    it("selects the element a step lands on without reporting it", async () => {
        const { viewer, selection } = await openSelectablePane();
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        expect(viewer.selectStep("Top_Task", { keepInView: true })).toBe(true);

        expect(selectedIds(selection)).toEqual(["Top_Task"]);
        expect(onSelectedElementChanged).not.toHaveBeenCalled();
    });

    it("selects the element on the sub-process plane the step's focus entered", async () => {
        const { viewer, selection } = await openSelectablePane();

        viewer.focusElement("Inner_Task");

        expect(viewer.selectStep("Inner_Task", { keepInView: false })).toBe(true);
        expect(selectedIds(selection)).toEqual(["Inner_Task"]);
    });

    it("drops the selection without reporting it for a step it does not draw", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        selection.select(registry.get("Top_Task"));
        const onSelectedElementChanged = vi.fn();
        viewer.onSelectedElementChanged(onSelectedElementChanged);

        expect(viewer.selectStep(undefined, { keepInView: false })).toBe(true);

        expect(selectedIds(selection)).toEqual([]);
        expect(onSelectedElementChanged).not.toHaveBeenCalled();
    });

    it("opens the context pad on the element a step lands on", async () => {
        const { viewer, registry } = await openSelectablePane({
            additionalModules: [ContextPadModule],
        });
        const contextPad = getDiService<{ isOpen(target?: unknown): boolean }>(
            viewer,
            "contextPad",
        );

        viewer.selectStep("Top_Task", { keepInView: true });

        expect(contextPad.isOpen(registry.get("Top_Task"))).toBe(true);
    });
});
