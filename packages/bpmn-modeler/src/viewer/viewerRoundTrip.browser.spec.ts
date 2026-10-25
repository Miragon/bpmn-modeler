import { afterEach, describe, expect, it } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";

import { createViewer } from "./createViewer";
import type { BpmnViewer } from "./viewer";
import { START_EVENT_XML } from "../__fixtures__/bpmnXml";
import { mountCanvas, removeMounts } from "../__fixtures__/surfaceMount";

/**
 * The viewer's rendered round trip — load, select, export XML/SVG. Render-
 * dependent (bpmn-js's viewbox transform needs real SVG layout), so it runs in
 * the browser project; jsdom coverage of the same factory stays in
 * `createViewer.spec.ts`. Kept separate from `viewState.browser.spec.ts`,
 * which covers view-state restore, a different concern.
 */

let viewer: BpmnViewer | undefined;
afterEach(() => {
    viewer?.destroy();
    viewer = undefined;
    removeMounts();
});

describe("createViewer (rendered round trip)", () => {
    it("loads a diagram, selects an element, and round-trips XML/SVG", async () => {
        viewer = await createViewer(mountCanvas());

        const result = await viewer.loadDiagram(START_EVENT_XML);
        expect(result.warnings).toEqual([]);

        const changes: string[][] = [];
        viewer.selection.onSelectionChanged((ids) => changes.push(ids));
        viewer.selection.selectElementsByIds(["StartEvent_1"]);
        expect(viewer.selection.getSelectedElementIds()).toEqual(["StartEvent_1"]);
        expect(changes.at(-1)).toEqual(["StartEvent_1"]);

        expect(await viewer.exportDiagram()).toContain("StartEvent_1");
        expect(await viewer.getDiagramSvg()).toContain("<svg");
    });

    it("rejects an export before any import with bpmn-js's own error", async () => {
        viewer = await createViewer(mountCanvas());

        await expect(viewer.exportDiagram()).rejects.toThrow("no definitions loaded");
    });

    it("rejects an unparsable import with the parser warnings as the cause", async () => {
        viewer = await createViewer(mountCanvas());

        const rejection = await viewer.loadDiagram("<not-bpmn/>").catch((error: unknown) => error);

        expect(rejection).toBeInstanceOf(Error);
        expect((rejection as Error).cause).toHaveProperty("warnings", expect.any(Array));
    });

    it("rejects a load on a destroyed viewer with NoModelerError", async () => {
        viewer = await createViewer(mountCanvas());
        viewer.destroy();

        await expect(viewer.loadDiagram(START_EVENT_XML)).rejects.toBeInstanceOf(NoModelerError);
    });
});
