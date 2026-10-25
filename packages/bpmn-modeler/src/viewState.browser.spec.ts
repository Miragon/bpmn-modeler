import { afterEach, describe, expect, it } from "vitest";

import { isUsableViewbox } from "@miragon/bpmn-modeler-types";

import { createModeler } from "./createModeler";
import { createDesigner } from "./design/createDesigner";
import { createViewer } from "./viewer/createViewer";
import type { BpmnDesignerHandle } from "./design/publicApi";
import type { ViewState } from "./viewState";
import { FAR_FROM_ORIGIN_XML } from "./__fixtures__/bpmnXml";
import {
    mountWithPanel,
    removeMounts,
    settleObserver,
    type SurfaceMount,
} from "./__fixtures__/surfaceMount";

/**
 * The #1490 view-state contract only reproduces against a real bpmn-js canvas
 * and a real ResizeObserver: an `applyViewState` right after `loadDiagram` must
 * win over the observer's delayed initial fit. jsdom lays nothing out and ships
 * no ResizeObserver, so this runs in Vitest browser mode (headless Chromium).
 * Every surface arms the delayed fit on import, so each runs the same contract.
 */

type ViewStateSurface = Pick<
    BpmnDesignerHandle,
    "loadDiagram" | "captureViewState" | "applyViewState" | "viewport" | "selection" | "destroy"
>;

const SURFACES: Array<{
    name: string;
    create(mount: SurfaceMount): Promise<ViewStateSurface>;
}> = [
    {
        name: "BpmnViewer",
        create: ({ container }) => createViewer(container),
    },
    {
        name: "BpmnDesigner",
        create: ({ container, panel }) =>
            createDesigner(container, { propertiesPanel: { parent: panel }, linting: false }),
    },
    {
        name: "BpmnModeler",
        create: ({ container, panel }) =>
            createModeler(container, {
                engine: "c8",
                propertiesPanel: { parent: panel },
                linting: false,
            }),
    },
];

const SNAPSHOT: ViewState = {
    viewport: { x: 5000, y: 3900, width: 640, height: 480 },
    selectedElementIds: ["Task_1"],
};

function expectViewportMatches(actual: { x: number; y: number; width: number; height: number }) {
    expect(actual.x).toBeCloseTo(SNAPSHOT.viewport.x, 0);
    expect(actual.y).toBeCloseTo(SNAPSHOT.viewport.y, 0);
    expect(actual.width).toBeCloseTo(SNAPSHOT.viewport.width, 0);
    expect(actual.height).toBeCloseTo(SNAPSHOT.viewport.height, 0);
}

describe.each(SURFACES)("$name view-state restore (real ResizeObserver)", (descriptor) => {
    let surface: ViewStateSurface | undefined;

    async function openSized(width: number, height: number) {
        const mount = mountWithPanel(width, height);
        const handle = await descriptor.create(mount);
        surface = handle;
        await handle.loadDiagram(FAR_FROM_ORIGIN_XML);
        return { handle, container: mount.container };
    }

    afterEach(() => {
        surface?.destroy();
        surface = undefined;
        removeMounts();
    });

    it("keeps a restored viewport across the delayed initial fit (#1490)", async () => {
        const { handle } = await openSized(800, 600);

        handle.applyViewState(SNAPSHOT);
        await settleObserver();

        expectViewportMatches(handle.viewport.getViewport());
        expect(handle.selection.getSelectedElementIds()).toEqual(["Task_1"]);
    });

    it("applies the snapshot viewport once a hidden container is sized", async () => {
        const { handle, container } = await openSized(0, 0);

        handle.applyViewState(SNAPSHOT);
        await settleObserver();

        container.style.width = "800px";
        container.style.height = "600px";
        await settleObserver();

        expectViewportMatches(handle.viewport.getViewport());
        expect(handle.selection.getSelectedElementIds()).toEqual(["Task_1"]);
    });

    it("does not re-fit a restored viewport when the container is resized", async () => {
        const { handle, container } = await openSized(800, 600);

        handle.applyViewState(SNAPSHOT);
        await settleObserver();

        const before = handle.viewport.getViewport();

        container.style.width = "1000px";
        await settleObserver();

        // Not re-fit: the top-left anchor and zoom are preserved. diagram-js
        // legitimately grows the viewbox width at constant scale as the container
        // widens, so width itself is expected to change — the anchor is what a
        // stray re-fit would move.
        const after = handle.viewport.getViewport();
        expect(after.x).toBeCloseTo(SNAPSHOT.viewport.x, 0);
        expect(after.y).toBeCloseTo(SNAPSHOT.viewport.y, 0);
        expect(after.scale).toBeCloseTo(before.scale!, 5);
    });

    it("still fits on a fresh open once the container is sized (regression guard)", async () => {
        const { handle, container } = await openSized(0, 0);
        await settleObserver();

        container.style.width = "800px";
        container.style.height = "600px";
        await settleObserver();

        const viewport = handle.viewport.getViewport();
        expect(isUsableViewbox(viewport)).toBe(true);
        // A fit centred on the diagram (spanning x 5000–5400), not the snapshot
        // box and not the origin — proof the initial fit still runs with no restore.
        expect(viewport.x).toBeGreaterThan(4000);
        expect(viewport.x).toBeLessThan(5400);
        expect(viewport.width).toBeGreaterThan(400);
    });

    it("keeps a centerOnElement focus across the delayed initial fit", async () => {
        const { handle } = await openSized(800, 600);

        expect(handle.viewport.centerOnElement("Task_2")).toBe(true);
        const focused = handle.viewport.getViewport();
        await settleObserver();

        // Task_2 centres at x 5350; at scale 1 the 800 px box starts 400 px left of it.
        const after = handle.viewport.getViewport();
        expect(after.x).toBeCloseTo(focused.x, 0);
        expect(after.y).toBeCloseTo(focused.y, 0);
        expect(after.x).toBeCloseTo(4950, 0);
    });

    it("restores a captured view state on a fresh instance", async () => {
        const { handle: original } = await openSized(800, 600);
        original.applyViewState(SNAPSHOT);
        await settleObserver();

        const captured = original.captureViewState();
        original.destroy();
        const { handle: successor } = await openSized(800, 600);
        successor.applyViewState(captured);
        await settleObserver();

        expect(captured.selectedElementIds).toEqual(["Task_1"]);
        expectViewportMatches(successor.viewport.getViewport());
        expect(successor.captureViewState()).toEqual(captured);
    });

    it("clears the selection when the snapshot has none", async () => {
        const { handle } = await openSized(800, 600);

        handle.selection.selectElementsByIds(["Task_1", "Task_2"]);
        expect(handle.selection.getSelectedElementIds()).toHaveLength(2);

        handle.applyViewState({ viewport: SNAPSHOT.viewport, selectedElementIds: [] });
        await settleObserver();

        expect(handle.selection.getSelectedElementIds()).toEqual([]);
    });
});
