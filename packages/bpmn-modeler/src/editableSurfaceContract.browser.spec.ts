import type Modeling from "bpmn-js/lib/features/modeling/Modeling";
import type EventBus from "diagram-js/lib/core/EventBus";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";

import { MESSY_LANES_BOUNDARY_SUBPROCESS } from "../../../libs/bpmn-layout/src/__fixtures__/integrationDiagrams";
import { DIAGRAM_WITH_REAL_GARBAGE } from "../../../libs/bpmn-layout/src/cleanup/__fixtures__/models";
import * as lintModule from "./bpmnlint/index";
import { createModeler } from "./createModeler";
import { createDesigner } from "./design/createDesigner";
import type { BpmnDesignerHandle, DesignerOptions } from "./design/publicApi";
import { FAR_FROM_ORIGIN_XML } from "./__fixtures__/bpmnXml";
import {
    afterPaint,
    mountWithPanel,
    removeMounts,
    settleObserver,
    type SurfaceMount,
} from "./__fixtures__/surfaceMount";

/**
 * The host-command contract the modeler and the designer both expose (import
 * fit, export, format, cleanup, import errors, theme, lint pushes, debounced
 * save, favourites). Both run the real bpmn-js modeling stack, so the contract
 * runs in the browser project against each surface.
 */

type SharedOptions = Pick<DesignerOptions, "linting" | "onContentSaved" | "favouriteBpmnElements">;

type LabelTarget = Parameters<Modeling["updateLabel"]>[0];

interface PopupMenuService {
    open(target: unknown, providerId: string, position: { x: number; y: number }): void;
    close(): void;
}

interface EditableSurfaceDescriptor {
    name: string;
    create(mount: SurfaceMount, options: SharedOptions): Promise<BpmnDesignerHandle>;
}

const EDITABLE_SURFACES: EditableSurfaceDescriptor[] = [
    {
        name: "modeler",
        create: ({ container, panel }, { favouriteBpmnElements, ...options }) =>
            createModeler(container, {
                engine: "c8",
                propertiesPanel: { parent: panel },
                settings: { favouriteBpmnElements },
                ...options,
            }),
    },
    {
        name: "designer",
        create: ({ container, panel }, options) =>
            createDesigner(container, { propertiesPanel: { parent: panel }, ...options }),
    },
];

const LINT_RESULTS = {
    "label-required": [
        { id: "StartEvent_1", message: "Element is missing label/name", category: "warn" },
    ],
};

function lintCompleted(surface: BpmnDesignerHandle): Promise<void> {
    return new Promise((resolve) =>
        surface.getService<EventBus>("eventBus").once("linting.completed", () => resolve()),
    );
}

function pinnedFavourites(surface: BpmnDesignerHandle): (string | null)[] {
    const popupMenu = surface.getService<PopupMenuService>("popupMenu");
    const startEvent = surface.getService("elementRegistry").get("StartEvent_1");
    popupMenu.open(startEvent, "bpmn-append", { x: 40, y: 60 });
    const favourites = Array.from(
        document.querySelectorAll(".am-bpmn-group--favourites .am-bpmn-button"),
        (button) => button.getAttribute("data-nav-key"),
    );
    popupMenu.close();
    return favourites;
}

describe.each(EDITABLE_SURFACES)("$name editable-surface contract", (descriptor) => {
    let surface: BpmnDesignerHandle | undefined;

    async function open(options: SharedOptions = { linting: false }): Promise<BpmnDesignerHandle> {
        return (await openMounted(options)).handle;
    }

    async function openMounted(options: SharedOptions = { linting: false }) {
        const mount = mountWithPanel();
        surface = await descriptor.create(mount, options);
        return { handle: surface, container: mount.container, panel: mount.panel };
    }

    afterEach(() => {
        surface?.destroy();
        surface = undefined;
        removeMounts();
    });

    it("rejects an export before any import with bpmn-js's own error", async () => {
        const handle = await open();

        await expect(handle.exportDiagram()).rejects.toThrow("no definitions loaded");
    });

    it("exports the loaded diagram as formatted XML", async () => {
        const handle = await open();
        await handle.loadDiagram(FAR_FROM_ORIGIN_XML);

        const xml = await handle.exportDiagram();

        expect(xml).toMatch(/^<\?xml[\s\S]*id="Task_1"/);
        expect(xml).toContain('\n  <bpmn:process id="Process_1"');
    });

    it("rejects an export on a destroyed surface with NoModelerError", async () => {
        const handle = await open();
        handle.destroy();

        await expect(handle.exportDiagram()).rejects.toBeInstanceOf(NoModelerError);
    });

    it("fits a far-from-origin diagram on load", async () => {
        const handle = await open();
        await handle.loadDiagram(FAR_FROM_ORIGIN_XML);
        await settleObserver();

        // The diagram spans x 5000–5400; an unfitted canvas stays at the origin.
        const { x } = handle.viewport.getViewport();
        expect(x).toBeGreaterThan(4000);
        expect(x).toBeLessThan(5400);
    });

    it("keeps the canvas size in sync after newDiagram", async () => {
        const { handle, container } = await openMounted();
        await handle.newDiagram();
        await settleObserver();
        const canvas = handle.getService("canvas");
        expect(canvas.viewbox().outer.width).toBe(800);

        container.style.width = "400px";
        await settleObserver();

        expect(canvas.viewbox().outer.width).toBe(400);
    });

    it("exports the rendered diagram as SVG", async () => {
        const handle = await open();
        await handle.loadDiagram(FAR_FROM_ORIGIN_XML);

        const svg = await handle.getDiagramSvg();

        expect(svg).toMatch(/^<\?xml[\s\S]*<svg/);
        expect(svg).toContain('data-element-id="Task_1"');
    });

    it("formats the diagram as a single undoable step", async () => {
        const handle = await open();
        await handle.loadDiagram(MESSY_LANES_BOUNDARY_SUBPROCESS);
        const commandStack = handle.getService("commandStack");

        const outcome = await handle.formatDiagram();

        expect(outcome.status).toBe("formatted");
        commandStack.undo();
        expect(commandStack.canUndo()).toBe(false);
    });

    it("reports diagram garbage, removes it on apply, and then reads clean", async () => {
        const handle = await open();
        await handle.loadDiagram(DIAGRAM_WITH_REAL_GARBAGE);

        const report = handle.cleanupDiagram();
        expect(report.status).toBe("reported");
        expect(report.items.length).toBeGreaterThan(0);

        expect(handle.cleanupDiagram({ apply: true }).status).toBe("applied");
        expect(handle.cleanupDiagram().items).toEqual([]);
    });

    it("rejects a load on a destroyed surface with NoModelerError", async () => {
        const handle = await open();
        handle.destroy();

        await expect(handle.loadDiagram(FAR_FROM_ORIGIN_XML)).rejects.toBeInstanceOf(
            NoModelerError,
        );
    });

    it("rejects an unparsable import with the parser warnings as the cause", async () => {
        const handle = await open();

        const rejection = await handle.loadDiagram("<not-bpmn/>").catch((error: unknown) => error);

        expect(rejection).toBeInstanceOf(Error);
        expect((rejection as Error).cause).toHaveProperty("warnings", expect.any(Array));
    });

    it("re-themes a live surface on the container and the panel", async () => {
        const { handle, container, panel } = await openMounted();
        const appliedThemes = () =>
            [container, panel].map((root) => root.getAttribute("data-bpmn-theme"));

        handle.setTheme("dark");
        expect(appliedThemes()).toEqual(["dark", "dark"]);

        handle.setTheme("light");
        expect(appliedThemes()).toEqual(["light", "light"]);
    });

    it("turns host lint pushes into warnings when created without a lint module", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const handle = await open();

        expect(() => handle.applyLintResults(LINT_RESULTS)).not.toThrow();
        expect(() => handle.applyLintingDisabled()).not.toThrow();
        expect(() => handle.startInPageLinting()).not.toThrow();

        expect(warn.mock.calls.map(([message]) => message)).toEqual(
            ["applyLintResults", "applyLintingDisabled", "startInPageLinting"].map(
                (method) => `${method} ignored: this surface was created without a lint module`,
            ),
        );
        warn.mockRestore();
    });

    it.each<{ label: string; linting: SharedOptions["linting"] }>([
        { label: "without a lint module", linting: false },
        { label: "with a lint module", linting: { module: lintModule, results: "external" } },
    ])(
        "throws NoModelerError from host lint pushes once destroyed, $label",
        async ({ linting }) => {
            const handle = await open({ linting });
            handle.destroy();
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

            expect(() => handle.applyLintResults(LINT_RESULTS)).toThrow(NoModelerError);
            expect(() => handle.applyLintingDisabled()).toThrow(NoModelerError);
            expect(() => handle.startInPageLinting()).toThrow(NoModelerError);
            expect(warn).not.toHaveBeenCalled();
            warn.mockRestore();
        },
    );

    it("paints host lint pushes and hands linting back to the page", async () => {
        const handle = await open({ linting: { module: lintModule, results: "external" } });
        await handle.loadDiagram(FAR_FROM_ORIGIN_XML);
        const canvasClasses = handle.getService("canvas").getContainer().classList;

        let completed = lintCompleted(handle);
        handle.applyLintResults(LINT_RESULTS);
        await completed;
        expect(canvasClasses.contains("bpmnlint-active")).toBe(true);

        handle.applyLintingDisabled();
        expect(canvasClasses.contains("bpmnlint-active")).toBe(false);
        expect(canvasClasses.contains("bpmnlint-disabled")).toBe(true);

        completed = lintCompleted(handle);
        handle.startInPageLinting();
        await completed;
        expect(canvasClasses.contains("bpmnlint-disabled")).toBe(false);
        expect(canvasClasses.contains("bpmnlint-active")).toBe(true);
    });

    it("saves edits through the debounced content callback", async () => {
        const onContentSaved = vi.fn();
        const handle = await open({ linting: false, onContentSaved });
        await handle.loadDiagram(FAR_FROM_ORIGIN_XML);

        const modeling = handle.getService("modeling");
        const task = handle.getService("elementRegistry").get("Task_1") as LabelTarget;
        modeling.updateLabel(task, "Renamed");

        await vi.waitFor(() => expect(onContentSaved).toHaveBeenCalledOnce());
        expect(onContentSaved.mock.calls[0][0].xml).toContain('name="Renamed"');
    });

    it("pins the configured favourites at the top of the append menu", async () => {
        const handle = await open({ linting: false, favouriteBpmnElements: ["bpmn:UserTask"] });
        await handle.loadDiagram(FAR_FROM_ORIGIN_XML);
        await afterPaint();

        expect(pinnedFavourites(handle)).toEqual(["fav:append-user-task"]);
    });

    it("replaces the pinned favourites on a live surface", async () => {
        const handle = await open({ linting: false, favouriteBpmnElements: ["bpmn:UserTask"] });
        await handle.loadDiagram(FAR_FROM_ORIGIN_XML);
        await afterPaint();

        handle.setFavouriteBpmnElements(["bpmn:ServiceTask", "bpmn:ExclusiveGateway"]);
        expect(pinnedFavourites(handle)).toEqual([
            "fav:append-service-task",
            "fav:append-exclusive-gateway",
        ]);

        handle.setFavouriteBpmnElements([]);
        expect(pinnedFavourites(handle)).toEqual([]);
    });

    it("throws NoModelerError for a favourites update after destroy", async () => {
        const handle = await open();
        handle.destroy();

        expect(() => handle.setFavouriteBpmnElements(["bpmn:UserTask"])).toThrow(NoModelerError);
    });
});
