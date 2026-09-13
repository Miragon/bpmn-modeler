import { afterEach, describe, expect, it, vi } from "vitest";

import { DiffResult } from "@miragon/bpmn-modeler-diff";

import { PositionedElement, centreOf } from "../../elementGeometry";
import { DiffPaneCoordinator } from "./DiffPaneCoordinator";
import { DiffViewer } from "./DiffViewer";
import {
    COLLAPSED_SUBPROCESS_AFTER_XML,
    COLLAPSED_SUBPROCESS_BEFORE_XML,
} from "./__fixtures__/collapsedSubprocessDiff";

/**
 * The diff pane's latch only matters against a real canvas: a `setViewport`
 * sync arriving before the first ResizeObserver delivery must survive the
 * pending initial fit, and a sync onto an unsized pane must apply once laid out.
 */

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="A" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="5100" y="3980" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const SYNC = { x: 5000, y: 3900, width: 640, height: 480 };

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const waitForViewportNotification = () => new Promise<void>((resolve) => setTimeout(resolve, 120));

async function settleObserver(): Promise<void> {
    for (let i = 0; i < 6; i++) {
        await raf();
    }
}

let diff: DiffViewer | undefined;
let container: HTMLElement | undefined;

function mount(width: number, height: number): HTMLElement {
    const el = document.createElement("div");
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.position = "absolute";
    document.body.appendChild(el);
    return el;
}

afterEach(() => {
    diff?.destroy();
    diff = undefined;
    container?.remove();
    container = undefined;
});

describe("DiffViewer initial-viewport latch (real ResizeObserver)", () => {
    it("keeps a setViewport sync across the delayed initial fit", async () => {
        container = mount(800, 600);
        diff = new DiffViewer(container);
        await diff.importXML(XML);

        diff.setViewport(SYNC);
        await settleObserver();

        const viewport = diff.getViewport();
        expect(viewport.x).toBeCloseTo(SYNC.x, 0);
        expect(viewport.y).toBeCloseTo(SYNC.y, 0);
    });

    it("applies a sync onto an unsized pane once it is laid out", async () => {
        container = mount(0, 0);
        diff = new DiffViewer(container);
        await diff.importXML(XML);

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
    findRoot(element: DiagramElement): DiagramElement | undefined;
    getRootElement(): DiagramElement;
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
        const beforeContainer = mount(800, 600);
        const afterContainer = mount(800, 600);
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
        beforeContainer.remove();
        afterContainer.remove();
    });

    it("suppresses programmatic positioning and cancels stale viewport notifications", async () => {
        const testContainer = mount(800, 600);
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
        testContainer.remove();
    });
});
