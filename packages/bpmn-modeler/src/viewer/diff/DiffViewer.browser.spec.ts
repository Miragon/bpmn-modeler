import { afterEach, describe, expect, it, vi } from "vitest";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import { NoModelerError } from "@miragon/bpmn-modeler-types";

import { DiffResult } from "@miragon/bpmn-modeler-diff";

import { PositionedElement, centreOf } from "../../elementGeometry";
import { DiffPaneCoordinator } from "./DiffPaneCoordinator";
import { DiffViewer } from "./DiffViewer";
import {
    COLLAPSED_SUBPROCESS_AFTER_XML,
    COLLAPSED_SUBPROCESS_BEFORE_XML,
} from "./__fixtures__/collapsedSubprocessDiff";
import { FAR_FROM_ORIGIN_XML } from "../../__fixtures__/bpmnXml";
import { mountCanvas, removeMounts, settleObserver } from "../../__fixtures__/surfaceMount";

/**
 * The diff pane's latch only matters against a real canvas: a `setViewport`
 * sync arriving before the first ResizeObserver delivery must survive the
 * pending initial fit, and a sync onto an unsized pane must apply once laid out.
 */

const SYNC = { x: 5000, y: 3900, width: 640, height: 480 };

const waitForViewportNotification = () => new Promise<void>((resolve) => setTimeout(resolve, 120));

let diff: DiffViewer | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
    diff?.destroy();
    diff = undefined;
    container = undefined;
    removeMounts();
});

describe("DiffViewer initial-viewport latch (real ResizeObserver)", () => {
    it("keeps a setViewport sync across the delayed initial fit", async () => {
        container = mountCanvas(800, 600);
        diff = new DiffViewer(container);
        await diff.importXML(FAR_FROM_ORIGIN_XML);

        diff.setViewport(SYNC);
        await settleObserver();

        const viewport = diff.getViewport();
        expect(viewport.x).toBeCloseTo(SYNC.x, 0);
        expect(viewport.y).toBeCloseTo(SYNC.y, 0);
    });

    it("applies a sync onto an unsized pane once it is laid out", async () => {
        container = mountCanvas(0, 0);
        diff = new DiffViewer(container);
        await diff.importXML(FAR_FROM_ORIGIN_XML);

        diff.setViewport(SYNC);
        await settleObserver();

        container.style.width = "800px";
        container.style.height = "600px";
        await settleObserver();

        const viewport = diff.getViewport();
        expect(viewport.x).toBeCloseTo(SYNC.x, 0);
        expect(viewport.y).toBeCloseTo(SYNC.y, 0);
    });
});

const NAVIGATION_ORDER = [
    "Top_Task",
    "Inner_Task",
    "Inner_Flow",
    "Nested_Task",
    "Before_Only_Nested",
    "After_Only_Inner",
] as const;

const DRILLDOWN_DIFF: DiffResult = {
    added: ["After_Only_Inner"],
    removed: ["Before_Only_Nested"],
    changed: ["Top_Task", "Inner_Task", "Inner_Flow", "Nested_Task"],
    layoutChanged: [],
    counts: { added: 1, removed: 1, changed: 4, layoutChanged: 0 },
    navigationOrder: NAVIGATION_ORDER,
};

interface DiagramElement extends PositionedElement {
    id: string;
}

interface CanvasService {
    setRootElement(root: DiagramElement): void;
    findRoot(element: DiagramElement): DiagramElement | undefined;
    getRootElement(): DiagramElement;
    setRootElement(element: DiagramElement): void;
    scroll(delta: { dx: number; dy: number }): void;
    viewbox(): { x: number; y: number; width: number; height: number };
    zoom(scale?: number): number;
}

interface ElementRegistryService {
    forEach(callback: (element: DiagramElement) => void): void;
    get(id: string): DiagramElement;
    getGraphics(element: DiagramElement | string): SVGElement;
}

function getServices(viewer: DiffViewer): {
    canvas: CanvasService;
    registry: ElementRegistryService;
} {
    const modeler = (viewer as unknown as { viewer: { get(name: string): unknown } }).viewer;
    return {
        canvas: modeler.get("canvas") as CanvasService,
        registry: modeler.get("elementRegistry") as ElementRegistryService,
    };
}

function expectCenteredOn(
    viewer: DiffViewer,
    id: string,
    expectedViewbox: { width: number; height: number },
): void {
    const { canvas, registry } = getServices(viewer);
    const element = registry.get(id);
    const root = canvas.findRoot(element);
    const centre = centreOf(element)!;
    const viewbox = canvas.viewbox();

    expect(canvas.getRootElement()).toBe(root);
    expect(registry.getGraphics(element).isConnected).toBe(true);
    expect(viewbox.x + viewbox.width / 2).toBeCloseTo(centre.x, 1);
    expect(viewbox.y + viewbox.height / 2).toBeCloseTo(centre.y, 1);
    expect(viewbox.width).toBeCloseTo(expectedViewbox.width, 1);
    expect(viewbox.height).toBeCloseTo(expectedViewbox.height, 1);
}

function expectFocusedOn(
    viewer: DiffViewer,
    id: string,
    expectedViewbox: { width: number; height: number },
): void {
    expectCenteredOn(viewer, id, expectedViewbox);
    const { registry } = getServices(viewer);
    expect(registry.getGraphics(id).classList.contains("diff-selected")).toBe(true);
}

function expectNoSelection(viewer: DiffViewer): void {
    const { registry } = getServices(viewer);
    registry.forEach((element) => {
        expect(registry.getGraphics(element)?.classList.contains("diff-selected") ?? false).toBe(
            false,
        );
    });
}

describe("DiffViewer collapsed-subprocess navigation", () => {
    it("steps through parent, subprocess, nested, connection, and fallback targets", async () => {
        const beforeContainer = mountCanvas(800, 600);
        const afterContainer = mountCanvas(800, 600);
        const before = new DiffViewer(beforeContainer);
        const after = new DiffViewer(afterContainer);
        await Promise.all([
            before.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML),
            after.importXML(COLLAPSED_SUBPROCESS_AFTER_XML),
        ]);
        await settleObserver();

        const beforeViewbox = before.getViewport();
        const afterViewbox = after.getViewport();
        const coordinator = new DiffPaneCoordinator(before, after);
        coordinator.apply(DRILLDOWN_DIFF);

        const forward = [
            ["Top_Task", "Top_Task"],
            ["Inner_Task", "Inner_Task"],
            ["Inner_Flow", "Inner_Flow"],
            ["Nested_Task", "Nested_Task"],
            ["Before_Only_Nested", "After_Only_Inner"],
            ["Top_Task", "After_Only_Inner"],
            ["Top_Task", "Top_Task"],
        ] as const;

        for (let i = 0; i < forward.length; i++) {
            coordinator.next();
            await waitForViewportNotification();
            const [beforeId, afterId] = forward[i];
            expectCenteredOn(before, beforeId, beforeViewbox);
            expectCenteredOn(after, afterId, afterViewbox);
            if (NAVIGATION_ORDER[coordinator.cursor] === beforeId) {
                expectFocusedOn(before, beforeId, beforeViewbox);
            } else {
                expectNoSelection(before);
            }
            if (NAVIGATION_ORDER[coordinator.cursor] === afterId) {
                expectFocusedOn(after, afterId, afterViewbox);
            } else {
                expectNoSelection(after);
            }
        }

        const backward = [
            ["Before_Only_Nested", "After_Only_Inner"],
            ["Before_Only_Nested", "Nested_Task"],
            ["Nested_Task", "Nested_Task"],
            ["Inner_Flow", "Inner_Flow"],
            ["Inner_Task", "Inner_Task"],
            ["Top_Task", "Top_Task"],
            ["Before_Only_Nested", "After_Only_Inner"],
        ] as const;

        for (let i = 0; i < backward.length; i++) {
            coordinator.previous();
            await waitForViewportNotification();
            const [beforeId, afterId] = backward[i];
            expectCenteredOn(before, beforeId, beforeViewbox);
            expectCenteredOn(after, afterId, afterViewbox);
            if (NAVIGATION_ORDER[coordinator.cursor] === beforeId) {
                expectFocusedOn(before, beforeId, beforeViewbox);
            } else {
                expectNoSelection(before);
            }
            if (NAVIGATION_ORDER[coordinator.cursor] === afterId) {
                expectFocusedOn(after, afterId, afterViewbox);
            } else {
                expectNoSelection(after);
            }
        }

        coordinator.destroy();
        before.destroy();
        after.destroy();
    });

    it("suppresses programmatic positioning and cancels stale viewport notifications", async () => {
        const testContainer = mountCanvas(800, 600);
        const viewer = new DiffViewer(testContainer);
        await viewer.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML);
        await settleObserver();

        const onViewportChanged = vi.fn();
        const dispose = viewer.onViewportChanged(onViewportChanged);
        const { canvas } = getServices(viewer);

        canvas.scroll({ dx: 20, dy: 10 });
        viewer.focusElement("Nested_Task");
        await waitForViewportNotification();
        expect(onViewportChanged).not.toHaveBeenCalled();

        canvas.scroll({ dx: 30, dy: 20 });
        await waitForViewportNotification();
        expect(onViewportChanged).toHaveBeenCalledTimes(1);

        canvas.scroll({ dx: 40, dy: 30 });
        viewer.setViewport({ x: 5000, y: 4000, width: 800, height: 600 });
        await waitForViewportNotification();
        expect(onViewportChanged).toHaveBeenCalledTimes(1);

        canvas.zoom(canvas.zoom() * 0.9);
        await waitForViewportNotification();
        expect(onViewportChanged).toHaveBeenCalledTimes(2);

        dispose();
        viewer.destroy();
    });
});

describe("DiffViewer opening fit", () => {
    it("fits each pane for itself and tells no partner", async () => {
        const testContainer = mountCanvas(800, 600);
        const viewer = new DiffViewer(testContainer);
        const onViewportChanged = vi.fn();
        const dispose = viewer.onViewportChanged(onViewportChanged);

        await viewer.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML);
        await settleObserver();
        await waitForViewportNotification();

        expect(onViewportChanged).not.toHaveBeenCalled();
        dispose();
        viewer.destroy();
    });
});

describe("DiffViewer planes", () => {
    async function subprocessPane() {
        const viewer = new DiffViewer(mountCanvas(800, 600));
        await viewer.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML);
        await settleObserver();
        const { canvas, registry } = getServices(viewer);
        const rootId = () => (canvas.getRootElement() as { id: string }).id;
        const enter = (planeRootId: string) => canvas.setRootElement(registry.get(planeRootId)!);
        return { viewer, rootId, enter };
    }

    it("reports a subprocess plane by its id and the plane it opened on as an empty id", async () => {
        const { viewer, enter } = await subprocessPane();
        const entered: string[] = [];
        viewer.onPlaneChanged((planeId) => entered.push(planeId));

        enter("Main_Subprocess_plane");
        enter("Process_1");

        expect(entered).toEqual(["Main_Subprocess", ""]);
        viewer.destroy();
    });

    it("goes back to the plane it opened on for an empty id, whatever its root is called", async () => {
        const { viewer, rootId } = await subprocessPane();
        viewer.showPlane("Main_Subprocess");

        const found = viewer.showPlane("");

        expect([found, rootId()]).toEqual([true, "Process_1"]);
        viewer.destroy();
    });

    it("reports no plane when a diagram is imported again", async () => {
        const { viewer } = await subprocessPane();
        const entered: string[] = [];
        viewer.onPlaneChanged((planeId) => entered.push(planeId));

        await viewer.importXML(COLLAPSED_SUBPROCESS_AFTER_XML);

        expect(entered).toEqual([]);
        viewer.destroy();
    });

    it("fits the plane the user enters, instead of bpmn-js' top-left corner, and tells no partner", async () => {
        const { viewer, enter } = await subprocessPane();
        const onViewportChanged = vi.fn();
        viewer.onViewportChanged(onViewportChanged);

        enter("Main_Subprocess_plane");
        await waitForViewportNotification();

        const viewport = viewer.getViewport();
        const { registry } = getServices(viewer);
        for (const id of ["Inner_Start", "Inner_Task", "Inner_End"]) {
            const shape = registry.get(id) as unknown as { x: number; y: number };
            expect(shape.x, id).toBeGreaterThanOrEqual(viewport.x);
            expect(shape.x, id).toBeLessThanOrEqual(viewport.x + viewport.width);
            expect(shape.y, id).toBeGreaterThanOrEqual(viewport.y);
            expect(shape.y, id).toBeLessThanOrEqual(viewport.y + viewport.height);
        }
        expect(onViewportChanged).not.toHaveBeenCalled();
        viewer.destroy();
    });

    it("reports no plane it entered itself, stepping or showing the whole diagram", async () => {
        const { viewer } = await subprocessPane();
        const entered: string[] = [];
        viewer.onPlaneChanged((planeId) => entered.push(planeId));

        viewer.focusElement("Nested_Task");
        viewer.fitDiagram();
        viewer.showPlane("Main_Subprocess");

        expect(entered).toEqual([]);
        viewer.destroy();
    });

    it("enters the plane its partner entered, and says when its version has none", async () => {
        const { viewer, rootId } = await subprocessPane();

        const found = viewer.showPlane("Main_Subprocess");
        const entered = rootId();
        const missing = viewer.showPlane("Not_There");

        expect([found, entered]).toEqual([true, "Main_Subprocess_plane"]);
        expect([missing, rootId()]).toEqual([false, "Main_Subprocess_plane"]);
        viewer.destroy();
    });
});

describe("DiffViewer fitDiagram", () => {
    it("goes back to the opening fit without a selection, and tells no partner", async () => {
        const testContainer = mountCanvas(800, 600);
        const viewer = new DiffViewer(testContainer);
        await viewer.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML);
        await settleObserver();
        const opening = viewer.getViewport();
        const onViewportChanged = vi.fn();
        const dispose = viewer.onViewportChanged(onViewportChanged);

        viewer.focusElement("Nested_Task");
        viewer.fitDiagram();
        await waitForViewportNotification();

        expect(viewer.getViewport()).toEqual(opening);
        expect(testContainer.querySelectorAll(".diff-selected")).toHaveLength(0);
        expect(onViewportChanged).not.toHaveBeenCalled();
        dispose();
        viewer.destroy();
    });
});

interface SelectionService {
    select(elements: DiagramElement | DiagramElement[] | null): void;
    get(): DiagramElement[];
}

function getDiService<T>(viewer: DiffViewer, name: string): T {
    return (viewer as unknown as { viewer: { get(name: string): T } }).viewer.get(name);
}

describe("DiffViewer additional modules", () => {
    it("registers no context pad without them, so embedders keep a readonly pane", async () => {
        container = mountCanvas(800, 600);
        diff = new DiffViewer(container);
        await diff.importXML(FAR_FROM_ORIGIN_XML);

        expect(() => getDiService(diff!, "contextPad")).toThrow();
    });

    it("registers the modules it is given", async () => {
        container = mountCanvas(800, 600);
        diff = new DiffViewer(container, { additionalModules: [ContextPadModule] });
        await diff.importXML(FAR_FROM_ORIGIN_XML);

        expect(getDiService(diff, "contextPad")).toBeDefined();
    });
});

async function openSelectablePane(): Promise<{
    viewer: DiffViewer;
    selection: SelectionService;
    registry: ElementRegistryService;
}> {
    container = mountCanvas(800, 600);
    diff = new DiffViewer(container);
    await diff.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML);
    return {
        viewer: diff,
        selection: getDiService<SelectionService>(diff, "selection"),
        registry: getServices(diff).registry,
    };
}

const selectedIds = (selection: SelectionService) => selection.get().map((element) => element.id);

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
        container = mountCanvas(800, 600);
        diff = new DiffViewer(container);
        const onSelectedElementChanged = vi.fn();
        diff.onSelectedElementChanged(onSelectedElementChanged);

        await diff.importXML(COLLAPSED_SUBPROCESS_BEFORE_XML);

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

describe("DiffViewer resize", () => {
    function centreOfViewport(viewer: DiffViewer): { x: number; y: number } {
        const viewport = viewer.getViewport();
        return { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };
    }

    // Top_Task spans y 120..200: it sits in the pane's lower part, so shrinking
    // the pane to 200 px cuts it off.
    function showTopTaskLow(viewer: DiffViewer, registry: ElementRegistryService): void {
        const centre = centreOf(registry.get("Top_Task") as PositionedElement)!;
        viewer.setViewport({ x: centre.x - 400, y: centre.y - 520, width: 800, height: 600 });
    }

    it("centres the element the user selected when the shrink cuts it off, and tells the partner", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        await settleObserver();
        showTopTaskLow(viewer, registry);
        selection.select(registry.get("Top_Task"));
        const onViewportChanged = vi.fn();
        viewer.onViewportChanged(onViewportChanged);

        container!.style.height = "200px";
        await settleObserver();
        await waitForViewportNotification();

        const centre = centreOf(registry.get("Top_Task") as PositionedElement)!;
        expect(centreOfViewport(viewer).x).toBeCloseTo(centre.x, 0);
        expect(centreOfViewport(viewer).y).toBeCloseTo(centre.y, 0);
        expect(onViewportChanged).toHaveBeenCalledExactlyOnceWith(viewer.getViewport());
    });

    it("leaves the viewport alone when the user panned away from the selection before the shrink", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        await settleObserver();
        showTopTaskLow(viewer, registry);
        selection.select(registry.get("Top_Task"));
        getServices(viewer).canvas.scroll({ dx: 2000, dy: 0 });
        const before = viewer.getViewport();
        const onViewportChanged = vi.fn();
        viewer.onViewportChanged(onViewportChanged);

        container!.style.height = "200px";
        await settleObserver();
        await waitForViewportNotification();

        expect(viewer.getViewport().x).toBeCloseTo(before.x, 0);
        expect(viewer.getViewport().y).toBeCloseTo(before.y, 0);
        expect(onViewportChanged).not.toHaveBeenCalled();
    });

    it("leaves the viewport alone when the selection stays fully visible after the shrink", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        await settleObserver();
        viewer.setViewport({ x: -250, y: 100, width: 800, height: 600 });
        selection.select(registry.get("Top_Task"));
        const before = viewer.getViewport();
        const onViewportChanged = vi.fn();
        viewer.onViewportChanged(onViewportChanged);

        container!.style.height = "400px";
        await settleObserver();
        await waitForViewportNotification();

        expect(viewer.getViewport().x).toBeCloseTo(before.x, 0);
        expect(viewer.getViewport().y).toBeCloseTo(before.y, 0);
        expect(onViewportChanged).not.toHaveBeenCalled();
    });

    it("centres a selection that a grow brought into view when the next shrink cuts it off", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        await settleObserver();
        // Top_Task's lower edge (y 200) lies below this viewbox (y -420..180).
        viewer.setViewport({ x: -250, y: -420, width: 800, height: 600 });
        selection.select(registry.get("Top_Task"));
        container!.style.height = "700px";
        await settleObserver();

        container!.style.height = "200px";
        await settleObserver();

        const centre = centreOf(registry.get("Top_Task") as PositionedElement)!;
        expect(centreOfViewport(viewer).x).toBeCloseTo(centre.x, 0);
        expect(centreOfViewport(viewer).y).toBeCloseTo(centre.y, 0);
    });

    it("keeps the user's place when the pane is hidden and shown again", async () => {
        const { viewer, selection, registry } = await openSelectablePane();
        await settleObserver();
        showTopTaskLow(viewer, registry);
        selection.select(registry.get("Top_Task"));
        const before = viewer.getViewport();

        container!.style.cssText = "position:absolute;width:0;height:0";
        await settleObserver();
        container!.style.cssText = "position:absolute;width:800px;height:600px";
        await settleObserver();

        expect(viewer.getViewport()).toEqual(before);
    });

    it("leaves an element mirrored from the partner where it is when the pane shrinks, and tells no partner", async () => {
        const { viewer, registry } = await openSelectablePane();
        await settleObserver();
        showTopTaskLow(viewer, registry);
        viewer.mirrorSelection("Top_Task");
        const before = viewer.getViewport();
        const onViewportChanged = vi.fn();
        viewer.onViewportChanged(onViewportChanged);

        container!.style.height = "200px";
        await settleObserver();
        await waitForViewportNotification();

        expect(viewer.getViewport().x).toBeCloseTo(before.x, 0);
        expect(viewer.getViewport().y).toBeCloseTo(before.y, 0);
        expect(onViewportChanged).not.toHaveBeenCalled();
    });

    it("applies the partner's viewport after shrinking without centring or reporting it", async () => {
        const { viewer } = await openSelectablePane();
        await settleObserver();
        viewer.mirrorSelection("Top_Task");
        container!.style.height = "200px";
        await settleObserver();
        const onViewportChanged = vi.fn();
        viewer.onViewportChanged(onViewportChanged);

        viewer.setViewport({ ...SYNC, height: 160 });
        await settleObserver();
        await waitForViewportNotification();

        expect(viewer.getViewport().x).toBeCloseTo(SYNC.x, 0);
        expect(viewer.getViewport().y).toBeCloseTo(SYNC.y, 0);
        expect(onViewportChanged).not.toHaveBeenCalled();
    });

    it("leaves the viewport alone on a resize without a selection", async () => {
        const { viewer } = await openSelectablePane();
        await settleObserver();
        const before = viewer.getViewport();

        container!.style.height = "200px";
        await settleObserver();

        expect(viewer.getViewport().x).toBeCloseTo(before.x, 0);
        expect(viewer.getViewport().y).toBeCloseTo(before.y, 0);
    });
});

describe("DiffViewer destroy", () => {
    it("throws NoModelerError from accessors after destroy and is idempotent", async () => {
        container = mountCanvas(800, 600);
        diff = new DiffViewer(container);
        await diff.importXML(FAR_FROM_ORIGIN_XML);

        diff.destroy();

        expect(() => diff!.getViewport()).toThrow(NoModelerError);
        expect(() => diff!.destroy()).not.toThrow();
    });
});
