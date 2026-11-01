import type { Element } from "bpmn-js/lib/model/Types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetectedEngine } from "@miragon/bpmn-modeler-types";

import { createModeler } from "../createModeler";
import { createDesigner } from "../design/createDesigner";
import { createViewer } from "../viewer/createViewer";
import { COLLAPSED_SUBPROCESS_BEFORE_XML } from "../viewer/diff/__fixtures__/collapsedSubprocessDiff";
import { FAR_FROM_ORIGIN_XML, tagAsCamunda7 } from "../__fixtures__/bpmnXml";
import {
    afterPaint,
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
 * surface can restore, and that an edit reaches the next surface's export.
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

const RENAMED_IN_DESIGN = 'name="Renamed in Design"';

async function openInDesign(
    engine: DetectedEngine,
    xml: string,
    onError: () => void,
): Promise<ModeSession> {
    const mount = mountWithPanel();
    session = await createModeSession({
        container: mount.container,
        engine,
        surfaces: realSurfaces(mount.panel),
        initialMode: "design",
        onError,
    });
    await session.getHandle().loadDiagram(xml);
    return session;
}

async function renameTaskInDesign(designSession: ModeSession): Promise<void> {
    const handle = designSession.getHandle();
    if (!("newDiagram" in handle)) {
        throw new Error(`Design is served by a readonly surface (${designSession.getMode()})`);
    }
    const task = handle.getService("elementRegistry").get("Task_1") as Element;
    handle.getService("modeling").updateLabel(task, "Renamed in Design");
    await afterPaint();
}

describe("createModeSession hands a Design edit to the next real surface", () => {
    it("finds a tagged model's edit in the View export and then the Implement export", async () => {
        const onError = vi.fn();
        const tagged = await openInDesign("c7", tagAsCamunda7(FAR_FROM_ORIGIN_XML), onError);
        await renameTaskInDesign(tagged);

        await tagged.requestMode("view");
        expect(onError).not.toHaveBeenCalled();
        expect(tagged.getMode()).toBe("view");
        await expect(tagged.getHandle().exportDiagram()).resolves.toContain(RENAMED_IN_DESIGN);

        await tagged.requestMode("implement");
        expect(onError).not.toHaveBeenCalled();
        expect(tagged.getMode()).toBe("implement");
        await expect(tagged.getHandle().exportDiagram()).resolves.toContain(RENAMED_IN_DESIGN);
    });

    it("finds an untagged model's edit in the View export and back in the designer's", async () => {
        const onError = vi.fn();
        const untagged = await openInDesign(undefined, FAR_FROM_ORIGIN_XML, onError);
        await renameTaskInDesign(untagged);

        await untagged.requestMode("view");
        expect(onError).not.toHaveBeenCalled();
        expect(untagged.getMode()).toBe("view");
        await expect(untagged.getHandle().exportDiagram()).resolves.toContain(RENAMED_IN_DESIGN);

        await untagged.requestMode("design");
        expect(onError).not.toHaveBeenCalled();
        expect(untagged.getMode()).toBe("design");
        await expect(untagged.getHandle().exportDiagram()).resolves.toContain(RENAMED_IN_DESIGN);
    });
});

describe("createModeSession hands a value the panel still debounces to the next real surface", () => {
    it.each([
        { model: "a tagged", engine: "c7" as const, xml: tagAsCamunda7(FAR_FROM_ORIGIN_XML) },
        { model: "an untagged", engine: undefined, xml: FAR_FROM_ORIGIN_XML },
    ])(
        "finds $model model's typed name in the View export, applied before beforeDestroy",
        async ({ engine, xml }) => {
            const onError = vi.fn();
            const events: string[] = [];
            const mount = mountWithPanel();
            session = await createModeSession({
                container: mount.container,
                engine,
                surfaces: realSurfaces(mount.panel),
                initialMode: "design",
                onSurfaceCreated: (handle) => {
                    if ("onCommandStackChanged" in handle) {
                        handle.onCommandStackChanged(() => {
                            events.push("commandStack.changed");
                        });
                    }
                },
                beforeDestroy: () => {
                    events.push("beforeDestroy");
                },
                onError,
            });
            const editable = session.getHandle();
            await editable.loadDiagram(xml);
            await afterPaint();
            editable.selection.selectElementsByIds(["Task_1"]);
            const nameField = () =>
                mount.panel.querySelector<HTMLTextAreaElement>("#bio-properties-panel-name");
            await expect.poll(() => nameField()?.value).toBe("A");
            nameField()!.value = "Typed in the panel";
            nameField()!.dispatchEvent(new Event("input", { bubbles: true }));
            await afterPaint();
            expect(events).toEqual([]);

            await session.requestMode("view");
            await afterPaint();

            expect(onError).not.toHaveBeenCalled();
            expect(events).toEqual(["commandStack.changed", "beforeDestroy"]);
            await expect(session.getHandle().exportDiagram()).resolves.toContain(
                'name="Typed in the panel"',
            );
        },
    );
});
