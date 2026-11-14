import { afterEach, describe, expect, it } from "vitest";

import "../index";
import { decisionXml } from "./__fixtures__/diffXml";
import type { DmnTableMarks } from "./diffMarks";
import { createDiffViewer, type DmnDiffMarks, type DmnDiffViewerHandle } from "./DmnDiffViewer";

const TABLE: DmnTableMarks = {
    columns: { added: ["Out_Y"], removed: [], changed: [] },
    rules: { added: ["R3"], removed: [], changed: ["R2"], moved: ["R5"] },
    cells: ["R2_X"],
    annotations: [],
    properties: ["hitPolicy"],
    counts: { added: 2, removed: 0, changed: 2, layoutChanged: 1 },
    attributesStep: "Table_1",
};

const MARKS: DmnDiffMarks = {
    added: ["Input_1"],
    removed: [],
    changed: ["Decision_1"],
    layoutChanged: ["IR_1"],
    tables: { Decision_1: TABLE },
    expressions: [],
};

const ADDED = "rgb(0, 230, 118)";
const CHANGED = "rgb(51, 93, 229)";
const CURRENT = "rgb(51, 93, 229)";

const viewers: DmnDiffViewerHandle[] = [];
const mounts: HTMLElement[] = [];

async function pane(rules?: readonly string[], width = 520, height = 260) {
    const container = document.createElement("div");
    container.style.cssText = `position: relative; width: ${width}px; height: ${height}px;`;
    document.body.append(container);
    mounts.push(container);
    const viewer = createDiffViewer(container, { theme: "light" });
    viewers.push(viewer);
    await viewer.importXML(decisionXml(rules));
    return { viewer, container };
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

function styleOf(container: HTMLElement, selector: string): CSSStyleDeclaration {
    const element = container.querySelector(selector);
    if (!element) throw new Error(`nothing matches ${selector}`);
    return getComputedStyle(element);
}

afterEach(() => {
    viewers.splice(0).forEach((viewer) => viewer.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
});

describe("DMN diff pane (real dmn-js)", () => {
    it("marks the DRD's changes and puts a changed table's counts on its decision", async () => {
        const { viewer, container } = await pane();

        viewer.setMarks(MARKS, { countBadges: true });

        const element = (id: string) =>
            container.querySelector(`.djs-element[data-element-id="${id}"]`);
        expect(element("Input_1")?.classList).toContain("diff-added");
        expect(element("Decision_1")?.classList).toContain("diff-changed");
        expect(element("IR_1")?.classList).toContain("diff-layout-changed");
        expect(container.querySelector(".dmn-diff-counts")?.textContent).toBe("2021");
    });

    it("sets a changed table's counts in its own small, bold type without a host font", async () => {
        const { viewer, container } = await pane();

        viewer.setMarks(MARKS, { countBadges: true });

        const badge = styleOf(container, ".dmn-diff-counts");
        expect(badge.fontWeight).toBe("600");
        expect(badge.fontSize).toBe("11px");
        expect(badge.lineHeight).toBe("16px");
        expect(badge.fontFamily).toMatch(/^"Geist Variable", Geist, .*sans-serif$/);
    });

    it("colours a requirement at its own width, so its arrowhead keeps its size", async () => {
        const { viewer, container } = await pane();
        const edge = '.djs-element[data-element-id="IR_1"] .djs-visual path';
        const ownWidth = styleOf(container, edge).strokeWidth;

        viewer.setMarks({ ...MARKS, added: ["Input_1", "IR_1"], layoutChanged: [] });
        const { stroke, strokeWidth: addedWidth } = styleOf(container, edge);
        const shapeWidth = styleOf(
            container,
            '.djs-element[data-element-id="Input_1"] .djs-visual > :nth-child(1)',
        ).strokeWidth;
        viewer.setMarks(MARKS);
        const { strokeWidth: movedWidth, strokeDasharray } = styleOf(container, edge);

        expect(stroke).toBe(ADDED);
        expect(addedWidth).toBe(ownWidth);
        expect(shapeWidth).toBe("2px");
        expect(movedWidth).toBe(ownWidth);
        expect(strokeDasharray).toBe("6px, 4px");
    });

    it("marks a decision table's rules, cells, columns and hit policy", async () => {
        const { viewer, container } = await pane();
        viewer.setMarks(MARKS);

        expect(await viewer.openView("Decision_1")).toBe(true);

        expect(styleOf(container, 'td.rule-index[data-row-id="R3"]').boxShadow).toContain(ADDED);
        expect(
            styleOf(container, 'td[data-row-id="R3"][data-col-id="In_A"]').backgroundColor,
        ).not.toBe(styleOf(container, 'td[data-row-id="R1"][data-col-id="In_A"]').backgroundColor);
        expect(styleOf(container, 'td[data-element-id="R2_X"]').boxShadow).toContain(CHANGED);
        expect(styleOf(container, 'td.rule-index[data-row-id="R5"]').backgroundImage).toContain(
            "repeating-linear-gradient",
        );
        // Output headers carry no column id; the fifth header cell is the fourth column, Out_Y.
        expect(styleOf(container, "thead th:nth-child(5)").boxShadow).toContain(ADDED);
        expect(styleOf(container, ".hit-policy").boxShadow).toContain(CHANGED);
    });

    it("keeps a table's marks when dmn-js renders the table again", async () => {
        const { viewer, container } = await pane();
        viewer.setMarks(MARKS);
        await viewer.openView("Decision_1");

        await viewer.openView(null);
        await viewer.openView("Decision_1");

        expect(styleOf(container, 'td[data-element-id="R2_X"]').boxShadow).toContain(CHANGED);
    });

    it("keeps the rule numbers in view while the table scrolls sideways", async () => {
        const { viewer, container } = await pane();
        await viewer.openView("Decision_1");

        expect(styleOf(container, 'td.rule-index[data-row-id="R1"]').position).toBe("sticky");
    });

    it("outlines the current rule and scrolls its changed cell into view", async () => {
        const { viewer, container } = await pane();
        viewer.setMarks(MARKS);
        await viewer.openView("Decision_1");

        viewer.focus("R2");
        await nextFrame();

        const row = container.querySelector('td[data-row-id="R2"]')?.parentElement;
        expect(row && getComputedStyle(row).outlineColor).toBe(CURRENT);
        const scroller = container.querySelector<HTMLElement>(".tjs-table-container");
        const cell = container.querySelector<HTMLElement>('td[data-element-id="R2_X"]');
        const visible = scroller!.getBoundingClientRect();
        const box = cell!.getBoundingClientRect();
        expect(box.left).toBeGreaterThanOrEqual(visible.left);
        expect(box.right).toBeLessThanOrEqual(visible.right + 1);
    });

    it("reports a view the user opens but not one opened for the partner pane", async () => {
        const { viewer, container } = await pane();
        const opened: Array<string | null> = [];
        viewer.onViewChanged((elementId) => opened.push(elementId));

        await viewer.openView("Decision_1");
        await new Promise((resolve) => setTimeout(resolve, 20));
        container.querySelector<HTMLElement>(".view-drd-button")?.click();
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(opened).toEqual([null]);
        expect(viewer.getActiveElementId()).toBeNull();
    });

    it("answers that it has no view for an element its version lacks", async () => {
        const { viewer } = await pane();

        expect(await viewer.openView("Decision_Missing")).toBe(false);
        expect(viewer.getActiveElementId()).toBeNull();
    });

    it("lines the partner's table up on the topmost rule both versions share", async () => {
        const before = await pane(["R1", "R2", "R3", "R4", "R5", "R6"], 520, 160);
        const after = await pane(["R0", "R1", "R2", "R3", "R4", "R5", "R6"], 520, 160);
        const tableOnlyIn = (side: "before" | "after"): DmnDiffMarks => ({
            ...MARKS,
            tables: {
                Decision_1: {
                    ...TABLE,
                    rules: { ...TABLE.rules, added: side === "after" ? ["R0"] : [] },
                },
            },
        });
        before.viewer.setMarks(tableOnlyIn("before"));
        after.viewer.setMarks(tableOnlyIn("after"));
        await before.viewer.openView("Decision_1");
        await after.viewer.openView("Decision_1");
        const scroller = (container: HTMLElement) =>
            container.querySelector<HTMLElement>(".tjs-table-container")!;
        const reported: unknown[] = [];
        before.viewer.onTableScroll((scroll) => reported.push(scroll));

        scroller(before.container).scrollTop = 60;
        await new Promise((resolve) => setTimeout(resolve, 50));
        const scroll = before.viewer.getTableScroll();
        after.viewer.setTableScroll(scroll!);
        await nextFrame();

        expect(reported).toHaveLength(1);
        expect(scroll?.rule).toMatch(/^R\d$/);
        const top = (container: HTMLElement) => {
            const cell = container.querySelector<HTMLElement>(
                `td.rule-index[data-row-id="${scroll?.rule}"]`,
            )!;
            return (
                cell.getBoundingClientRect().top - scroller(container).getBoundingClientRect().top
            );
        };
        expect(Math.abs(top(after.container) - top(before.container))).toBeLessThanOrEqual(1);
    });

    it("outlines and centres the current DRD element", async () => {
        const { viewer, container } = await pane();
        viewer.setMarks(MARKS);

        viewer.focus("Input_1");
        viewer.focus("Decision_1");

        const element = (id: string) =>
            container.querySelector(`.djs-element[data-element-id="${id}"]`);
        expect(element("Decision_1")?.classList).toContain("diff-selected");
        expect(element("Input_1")?.classList).not.toContain("diff-selected");
        const viewport = viewer.getViewport()!;
        expect(viewport.x + viewport.width / 2).toBeCloseTo(250, 0);
        expect(viewport.y + viewport.height / 2).toBeCloseTo(120, 0);
    });

    it("outlines the current column and the current table attributes", async () => {
        const { viewer, container } = await pane();
        viewer.setMarks(MARKS);
        await viewer.openView("Decision_1");

        viewer.focus("Out_Y");
        expect(styleOf(container, 'td[data-col-id="Out_Y"]').outlineColor).toBe(CURRENT);

        viewer.focus("Table_1");
        expect(styleOf(container, ".hit-policy").outlineColor).toBe(CURRENT);
    });

    it("takes no step for the table attributes of a table whose changes name none", async () => {
        const { viewer, container } = await pane();
        const { attributesStep: _none, ...withoutAttributesStep } = TABLE;
        viewer.setMarks({ ...MARKS, tables: { Decision_1: withoutAttributesStep } });
        await viewer.openView("Decision_1");

        viewer.focus("Table_1");

        expect(styleOf(container, ".hit-policy").outlineStyle).toBe("none");
    });

    it.each([
        ["added", { ...MARKS, added: ["Decision_1"], tables: {} }],
        ["removed", { ...MARKS, removed: ["Decision_1"], tables: {} }],
    ] as const)(
        "bars the table of a decision only this version has as %s",
        async (status, marks) => {
            const { viewer, container } = await pane();
            viewer.setMarks(marks);

            await viewer.openView("Decision_1");

            expect(container.dataset.dmnDiffView).toBe(status);
            expect(viewer.getViewStatus()).toBe(status);
            expect(styleOf(container, ".tjs-table-container").boxShadow).toContain(
                status === "added" ? ADDED : "rgb(205, 24, 57)",
            );
            await viewer.openView(null);
            expect(container.dataset.dmnDiffView).toBeUndefined();
            expect(viewer.getViewStatus()).toBeUndefined();
        },
    );

    it("names no status for a changed table, nor before it has marks", async () => {
        const { viewer } = await pane();
        await viewer.openView("Decision_1");
        const withoutMarks = viewer.getViewStatus();

        viewer.setMarks(MARKS);

        expect(withoutMarks).toBeUndefined();
        expect(viewer.getViewStatus()).toBeUndefined();
    });

    it("shows the DRD whole again, as it opened, without an outline or a report", async () => {
        const { viewer, container } = await pane();
        viewer.setMarks(MARKS);
        const opening = viewer.getViewport()!;
        const reported: unknown[] = [];
        viewer.onViewportChanged((viewport) => reported.push(viewport));

        viewer.focus("Decision_1");
        viewer.showWholeView();
        await new Promise((resolve) => setTimeout(resolve, 120));

        const viewport = viewer.getViewport()!;
        expect(viewport.x).toBeCloseTo(opening.x, 0);
        expect(viewport.y).toBeCloseTo(opening.y, 0);
        expect(viewport.width).toBeCloseTo(opening.width, 0);
        expect(container.querySelectorAll(".diff-selected")).toHaveLength(0);
        expect(reported).toHaveLength(0);
    });

    it("reports the user's pan, not a viewport the partner pane sent", async () => {
        const { viewer, container } = await pane();
        const reported: unknown[] = [];
        viewer.onViewportChanged((viewport) => reported.push(viewport));

        viewer.setViewport({ x: -40, y: -20, width: 520, height: 260 });
        await new Promise((resolve) => setTimeout(resolve, 120));
        const svg = container.querySelector(".djs-container > svg")!;
        // diagram-js listens to the wheel only while the pointer is over the canvas.
        svg.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        svg.dispatchEvent(new WheelEvent("wheel", { deltaY: 40, bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(reported).toHaveLength(1);
    });

    it("does not report a table scroll the partner pane sent", async () => {
        const { viewer } = await pane(undefined, 520, 160);
        viewer.setMarks(MARKS);
        await viewer.openView("Decision_1");
        const reported: unknown[] = [];
        viewer.onTableScroll((scroll) => reported.push(scroll));

        // R3 is an added rule, which the partner lacks, so R4 is the first shared one.
        viewer.setTableScroll({ rule: "R4", offset: 0, left: 0 });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(reported).toEqual([]);
        expect(viewer.getTableScroll()?.rule).toBe("R4");
    });

    it("reopens the open view in another language and keeps the DRD where it was", async () => {
        const { viewer, container } = await pane();
        viewer.setViewport({ x: -100, y: -50, width: 520, height: 260 });

        await viewer.setLocale("de");

        expect(viewer.getViewport()?.x).toBeCloseTo(-100, 0);
        await viewer.openView("Decision_1");
        expect(container.querySelector(".view-drd-button")?.textContent).not.toBe("View DRD");
        await viewer.setLocale("en");
    });

    it("bars a changed literal expression", async () => {
        const { viewer, container } = await pane();
        viewer.setMarks({ ...MARKS, expressions: ["Decision_2"] });

        await viewer.openView("Decision_2");

        expect(container.dataset.dmnDiffView).toBe("changed");
        expect(viewer.getViewStatus()).toBe("changed");
        expect(
            styleOf(container, ".dmn-literal-expression-container .textarea").boxShadow,
        ).toContain(CHANGED);
    });

    it("answers only for the view that has a viewport or a table scroll", async () => {
        const { viewer, container } = await pane();
        viewer.setMarks(MARKS);

        expect(viewer.getTableScroll()).toBeUndefined();
        viewer.setTableScroll({ offset: 10, left: 0 });
        await viewer.openView("Decision_1");
        expect(viewer.getViewport()).toBeUndefined();
        viewer.setViewport({ x: 1, y: 1, width: 10, height: 10 });

        viewer.focus("R2");
        viewer.focus(undefined);
        expect(styleOf(container, 'td[data-row-id="R2"]').outlineStyle).toBe("none");
    });

    it("scrolls without an anchor when no rule both versions share is in view", async () => {
        const { viewer } = await pane(["R3"], 520, 160);
        viewer.setMarks(MARKS);
        await viewer.openView("Decision_1");

        expect(viewer.getTableScroll()).toEqual({ offset: 0, left: 0 });
        viewer.setTableScroll({ offset: 0, left: 40 });
    });

    it("puts no counts on the DRD unless asked", async () => {
        const { viewer, container } = await pane();

        viewer.setMarks(MARKS);

        expect(container.querySelector(".dmn-diff-counts")).toBeNull();
    });

    it("brings a rule into view without outlining it", async () => {
        const { viewer, container } = await pane(undefined, 520, 160);
        viewer.setMarks(MARKS);
        await viewer.openView("Decision_1");

        viewer.reveal("R6");
        await nextFrame();

        const scroller = container.querySelector<HTMLElement>(".tjs-table-container")!;
        const row = container.querySelector<HTMLElement>('td.rule-index[data-row-id="R6"]')!;
        expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
            scroller.getBoundingClientRect().bottom + 1,
        );
        expect(getComputedStyle(row.parentElement!).outlineStyle).toBe("none");
    });

    it("fits the DRD centred below the top inset without zooming in, and brings it back after a table", async () => {
        const container = document.createElement("div");
        container.style.cssText = "position: relative; width: 520px; height: 400px;";
        document.body.append(container);
        mounts.push(container);
        const viewer = createDiffViewer(container, { theme: "light", topInset: 100 });
        viewers.push(viewer);
        await viewer.importXML(decisionXml());

        const fitted = viewer.getViewport()!;
        const scale = 520 / fitted.width;
        expect(scale).toBeLessThanOrEqual(1);
        // Centred like the BPMN diff, in the 300px the inset leaves below it.
        const content = container
            .querySelector<SVGGElement>(".djs-container svg .viewport")!
            .getBBox();
        expect((content.y + content.height / 2 - fitted.y) * scale).toBeCloseTo(100 + 300 / 2, 0);
        expect((content.x + content.width / 2 - fitted.x) * scale).toBeCloseTo(520 / 2, 0);

        viewer.setViewport({ ...fitted, x: fitted.x + 50 });
        await viewer.openView("Decision_1");
        await viewer.openView(null);

        expect(viewer.getViewport()?.x).toBeCloseTo(fitted.x + 50, 0);
    });
});
