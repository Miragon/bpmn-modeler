import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetectedEngine } from "@miragon/bpmn-modeler-types";

import { createModeler } from "../createModeler";
import { createDesigner } from "../design/createDesigner";
import { createViewer } from "../viewer/createViewer";
import { COLLAPSED_SUBPROCESS_BEFORE_XML } from "../viewer/diff/__fixtures__/collapsedSubprocessDiff";
import { tagAsCamunda7 } from "../__fixtures__/bpmnXml";
import {
    mountWithPanel,
    removeMounts,
    settleObserver,
    type SurfaceMount,
} from "../__fixtures__/surfaceMount";
import { createModeSession } from "./modeSession";
import type { ViewportData } from "../viewport";
import type { ModeSession, SurfaceFactories, SurfaceHandle } from "./publicApi";

/**
 * The mode switch end to end over the real viewer, designer and modeler
 * factories — the composition the mode strip runs in production.
 * `modeSession.spec.ts` covers the transition failure paths with doubles; this
 * pins that the view state each real surface captures is one the next real
 * surface can restore.
 */

const DRILLED_IN_VIEWPORT = { x: 1700, y: 1900, width: 1200, height: 900 };

function realSurfaces(panel: HTMLElement): SurfaceFactories {
    const propertiesPanel = { parent: panel };
    return {
        view: ({ container, theme }) => createViewer(container, { theme, propertiesPanel }),
        design: ({ container, theme }) =>
            createDesigner(container, { theme, propertiesPanel, linting: false }),
        implement: ({ container, theme, engine, mode }) =>
            createModeler(container, { engine, mode, theme, propertiesPanel, linting: false }),
    };
}

let session: ModeSession | undefined;

/** The viewport the viewer actually settled on, which every later surface must restore. */
let viewportBeforeSwitch: ViewportData;

async function openInView(
    mount: SurfaceMount,
    engine: DetectedEngine,
    xml: string,
    onModeChanged = vi.fn(),
): Promise<ModeSession> {
    session = await createModeSession({
        container: mount.container,
        engine,
        surfaces: realSurfaces(mount.panel),
        initialMode: "view",
        onModeChanged,
    });
    const viewer = session.getHandle();
    await viewer.loadDiagram(xml);
    viewer.rootElement.setRootElementById("Main_Subprocess_plane");
    viewer.viewport.setViewport(DRILLED_IN_VIEWPORT);
    viewer.selection.selectElementsByIds(["Inner_Task"]);
    await settleObserver();
    viewportBeforeSwitch = viewer.viewport.getViewport();
    // diagram-js snaps the applied box to whole pixels; anything farther off means no restore happened.
    expect(viewportBeforeSwitch.x).toBeCloseTo(DRILLED_IN_VIEWPORT.x, -1);
    return session;
}

function expectDrilledInViewState(handle: SurfaceHandle): void {
    expect(handle.rootElement.getRootElementId()).toBe("Main_Subprocess_plane");
    expect(handle.selection.getSelectedElementIds()).toEqual(["Inner_Task"]);
    const viewport = handle.viewport.getViewport();
    expect(viewport.x).toBeCloseTo(viewportBeforeSwitch.x, 0);
    expect(viewport.y).toBeCloseTo(viewportBeforeSwitch.y, 0);
    expect(viewport.width).toBeCloseTo(viewportBeforeSwitch.width, 0);
    expect(viewport.height).toBeCloseTo(viewportBeforeSwitch.height, 0);
}

afterEach(async () => {
    await session?.destroy();
    session = undefined;
    removeMounts();
});

describe("createModeSession over the real surfaces", () => {
    it("carries a tagged model's plane, viewport and selection from View into the modeler", async () => {
        const onModeChanged = vi.fn();
        const mount = mountWithPanel();
        const tagged = await openInView(
            mount,
            "c7",
            tagAsCamunda7(COLLAPSED_SUBPROCESS_BEFORE_XML),
            onModeChanged,
        );

        await tagged.requestMode("design");
        await settleObserver();

        const modeler = tagged.getHandle();
        expect(onModeChanged).toHaveBeenCalledExactlyOnceWith("design", "recreate");
        expect("getMode" in modeler && modeler.getMode()).toBe("design");
        expect(mount.container.dataset.bpmnMode).toBe("design");
        expectDrilledInViewState(modeler);
    });

    it("toggles a tagged model between Design and Implement on the same modeler", async () => {
        const onModeChanged = vi.fn();
        const mount = mountWithPanel();
        const tagged = await openInView(
            mount,
            "c7",
            tagAsCamunda7(COLLAPSED_SUBPROCESS_BEFORE_XML),
            onModeChanged,
        );
        await tagged.requestMode("design");
        const modeler = tagged.getHandle();
        onModeChanged.mockClear();

        await tagged.requestMode("implement");

        expect(tagged.getHandle()).toBe(modeler);
        expect(tagged.getMode()).toBe("implement");
        expect(onModeChanged).toHaveBeenCalledExactlyOnceWith("implement", "toggle");
        expect(mount.container.dataset.bpmnMode).toBe("implement");
        expect(mount.panel.dataset.bpmnMode).toBe("implement");
        expectDrilledInViewState(modeler);
    });

    it("hands an untagged model to the designer and back to the viewer", async () => {
        const mount = mountWithPanel();
        const untagged = await openInView(mount, undefined, COLLAPSED_SUBPROCESS_BEFORE_XML);
        expect(untagged.availableModes()).toEqual(["view", "design"]);

        await untagged.requestMode("design");
        await settleObserver();
        const designer = untagged.getHandle();
        expect("setMode" in designer).toBe(false);
        expectDrilledInViewState(designer);

        await untagged.requestMode("view");
        await settleObserver();
        expect(untagged.getHandle()).not.toBe(designer);
        expectDrilledInViewState(untagged.getHandle());
    });
});
