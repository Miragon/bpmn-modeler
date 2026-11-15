import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ApplyMergeStatesQuery,
    type MergePaneStates,
    type MergePaneStep,
    SHOW_ALL_CURSOR,
    SyncCursorQuery,
    SyncDiffPlaneQuery,
    SyncViewportQuery,
} from "@miragon/bpmn-modeler-shared";

// The real diff primitives need a live bpmn-js canvas, which jsdom cannot load.
const fakes = vi.hoisted(() => {
    type Viewport = { x: number; y: number; width: number; height: number };

    class FakeDiffViewer {
        static last: FakeDiffViewer;
        // The ids this pane's canvas draws.
        drawn = new Set(["Task_Check", "Task_Pack", "Flow_1"]);
        importXML = vi.fn(async (_xml: string) => ({ warnings: [] }));
        focusElement = vi.fn((id: string) => this.drawn.has(id));
        clearSelectionMarker = vi.fn();
        fitDiagram = vi.fn();
        setViewport = vi.fn();
        showPlane = vi.fn((_planeId: string) => true);
        mirrorSelection = vi.fn();
        onPlaneChanged = vi.fn();
        viewportListener: ((viewport: Viewport) => void) | undefined;
        onViewportChanged = vi.fn((listener: (viewport: Viewport) => void) => {
            this.viewportListener = listener;
        });
        onSelectedElementChanged = vi.fn();
        constructor(
            readonly container: HTMLElement,
            readonly options: { additionalModules?: unknown[] } = {},
        ) {
            FakeDiffViewer.last = this;
        }
    }

    class FakeDiffSideLabel {
        static last: FakeDiffSideLabel | undefined;
        showFilename = vi.fn();
        showPlaneMissing = vi.fn();
        constructor(
            readonly parent: HTMLElement,
            readonly side: "before" | "after",
        ) {
            FakeDiffSideLabel.last = this;
        }
    }

    const marks = { paint: vi.fn() };
    const elementXmlChanges = {
        config: undefined as { canShowElementXmlChanges(): boolean } | undefined,
    };
    return { FakeDiffViewer, FakeDiffSideLabel, marks, elementXmlChanges };
});

vi.mock("@miragon/bpmn-modeler/viewer", () => ({
    DiffViewer: fakes.FakeDiffViewer,
    DiffSideLabel: fakes.FakeDiffSideLabel,
}));

vi.mock("./elementXmlContextPad", () => ({
    createElementXmlChangesModule: (config: NonNullable<typeof fakes.elementXmlChanges.config>) => {
        fakes.elementXmlChanges.config = config;
        return { elementXmlChangesEntryConfig: ["value", config] };
    },
}));

vi.mock("./mergeMarks", () => ({
    createMergeMarksModule: (config: { attach(marks: typeof fakes.marks): void }) => {
        config.attach(fakes.marks);
        return { mergeMarks: ["value", fakes.marks] };
    },
}));

import { MergeMode } from "./mergeMode";

const viewer = () => fakes.FakeDiffViewer.last;

const step = (id: string, shapeless = false, onThisPane = true): MergePaneStep => ({
    id,
    shapeless,
    onThisPane,
});

const STATES: MergePaneStates = {
    caption: { side: "current", role: "branch", ref: "main", shortHash: "1111111" },
    marks: {
        takenFromThisSide: ["Task_Check"],
        takenFromOtherSide: ["Flow_1"],
        conflict: ["Task_Pack"],
    },
    shapeless: [{ id: "Process_1", type: "bpmn:Process", marker: "conflict" }],
    openConflictSteps: [
        step("Task_Pack"),
        step("Task_Gone", false, false),
        step("Process_1", true),
    ],
    allSteps: [
        step("Task_Check"),
        step("Flow_1"),
        step("Task_Pack"),
        step("Task_Gone", false, false),
        step("Process_1", true),
    ],
    openConflicts: 3,
};

function mergeStates(states: Partial<MergePaneStates> = {}, elementXmlChanges = false) {
    return new ApplyMergeStatesQuery("before", { ...STATES, ...states }, elementXmlChanges);
}

function dispatch(data: unknown): void {
    window.dispatchEvent(new MessageEvent("message", { data }));
}

describe("MergeMode", () => {
    let windowAddEventListener: ReturnType<typeof vi.spyOn>;
    let legendParent: HTMLElement;
    const host = { postMessage: vi.fn() };
    const posted = () => host.postMessage.mock.calls.map(([message]) => message);
    const cursorsPosted = () =>
        posted()
            .filter((message) => message.type === "CursorChangedCommand")
            .map((message) => (message as { index: number }).index);

    const legendButton = (name: string): HTMLButtonElement => {
        const found = [...legendParent.querySelectorAll("button")].find(
            (candidate) =>
                candidate.getAttribute("aria-label") === name ||
                candidate.textContent === name ||
                candidate.title === name,
        );
        if (!found) throw new Error(`no legend button ${name}`);
        return found;
    };
    const next = () => legendButton("Next change").click();
    const previous = () => legendButton("Prev change").click();
    const legendText = () => legendParent.textContent ?? "";

    async function startMergePane(): Promise<MergeMode> {
        const mergeMode = new MergeMode(document.createElement("div"), legendParent, host);
        await mergeMode.startWith("<current />");
        return mergeMode;
    }

    beforeEach(() => {
        windowAddEventListener = vi.spyOn(window, "addEventListener");
        legendParent = document.createElement("div");
        document.body.append(legendParent);
    });

    afterEach(() => {
        for (const [type, listener, options] of windowAddEventListener.mock.calls) {
            window.removeEventListener(type, listener as EventListener, options);
        }
        vi.restoreAllMocks();
        host.postMessage.mockReset();
        fakes.marks.paint.mockReset();
        legendParent.remove();
        delete document.body.dataset.diffSide;
    });

    describe("states from the host", () => {
        it("paints the three markers and tags the pane's side", async () => {
            await startMergePane();

            dispatch(mergeStates());

            expect(fakes.marks.paint).toHaveBeenCalledWith(STATES.marks, "Conflict");
            expect(document.body.dataset.diffSide).toBe("before");
        });

        it("reports the pane ready once its XML is imported", async () => {
            await startMergePane();

            expect(viewer().importXML).toHaveBeenCalledWith("<current />");
            expect(posted()).toEqual([expect.objectContaining({ type: "DiffReadyCommand" })]);
        });

        it("holds states that arrive before the import and paints them after it", async () => {
            let finishImport: () => void = () => undefined;
            const mergeMode = new MergeMode(document.createElement("div"), legendParent, host);
            viewer().importXML.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finishImport = () => resolve({ warnings: [] });
                    }),
            );
            const started = mergeMode.startWith("<current />");

            dispatch(mergeStates());
            expect(fakes.marks.paint).not.toHaveBeenCalled();
            finishImport();
            await started;

            expect(fakes.marks.paint).toHaveBeenCalledTimes(1);
        });

        it("labels the pane with its side's caption", async () => {
            await startMergePane();

            dispatch(mergeStates());

            expect(fakes.FakeDiffSideLabel.last?.showFilename).toHaveBeenLastCalledWith(
                "Current: your branch main · 1111111",
            );
        });

        it("counts the open conflicts and the pane's markers in the legend", async () => {
            await startMergePane();

            dispatch(mergeStates());

            expect(legendText()).toContain("3 open conflicts");
            expect(legendText()).toContain("Taken from this side 1");
            expect(legendText()).toContain("Conflict 1");
        });

        it("offers Show XML changes only when the host does", async () => {
            await startMergePane();

            dispatch(mergeStates({}, false));
            expect(fakes.elementXmlChanges.config?.canShowElementXmlChanges()).toBe(false);
            dispatch(mergeStates({}, true));
            expect(fakes.elementXmlChanges.config?.canShowElementXmlChanges()).toBe(true);
        });
    });

    describe("stepping", () => {
        it("steps through the open conflicts in order and posts the cursor in all steps", async () => {
            await startMergePane();
            dispatch(mergeStates());

            next();

            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
            expect(cursorsPosted()).toEqual([2]);
            expect(legendText()).toContain("1/3");
        });

        it("leaves this pane in place on a step only the partner pane draws", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();
            viewer().focusElement.mockClear();

            next();

            expect(viewer().focusElement).not.toHaveBeenCalled();
            expect(viewer().clearSelectionMarker).toHaveBeenCalled();
            expect(cursorsPosted()).toEqual([2, 3]);
        });

        it("selects a shape-less entry in the legend instead of moving the canvas", async () => {
            await startMergePane();
            dispatch(mergeStates());

            previous();

            expect(viewer().focusElement).not.toHaveBeenCalled();
            const entry = legendParent.querySelector('[data-element-id="Process_1"]');
            expect(entry?.getAttribute("aria-current")).toBe("true");
            expect(cursorsPosted()).toEqual([4]);
        });

        it("steps to a shape-less element from its legend entry", async () => {
            await startMergePane();
            dispatch(mergeStates());

            legendParent.querySelector<HTMLButtonElement>('[data-element-id="Process_1"]')?.click();

            expect(cursorsPosted()).toEqual([4]);
            expect(legendText()).toContain("3/3");
        });

        it("switches to every merged element", async () => {
            await startMergePane();
            dispatch(mergeStates());

            legendButton("All merged elements").click();
            next();

            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Check");
            expect(cursorsPosted()).toEqual([0]);
            expect(legendButton("All merged elements").getAttribute("aria-pressed")).toBe("true");
        });

        it("stays on the stepped element after a repaint", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();

            dispatch(
                mergeStates({
                    openConflictSteps: [step("Task_Gone", false, false), step("Process_1", true)],
                    openConflicts: 2,
                }),
            );
            next();

            expect(cursorsPosted()).toEqual([2, 3]);
        });

        it("follows the partner's cursor without echoing it", async () => {
            await startMergePane();
            dispatch(mergeStates());

            dispatch(new SyncCursorQuery(2));

            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
            expect(cursorsPosted()).toEqual([]);
        });

        it("goes back to the whole diagram with Show all, and takes the partner along", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();

            legendButton("Show all").click();

            expect(viewer().fitDiagram).toHaveBeenCalled();
            expect(cursorsPosted()).toEqual([2, SHOW_ALL_CURSOR]);
        });

        it("goes back to the whole diagram when the partner does", async () => {
            await startMergePane();
            dispatch(mergeStates());

            dispatch(new SyncCursorQuery(SHOW_ALL_CURSOR));

            expect(viewer().fitDiagram).toHaveBeenCalled();
            expect(cursorsPosted()).toEqual([]);
        });
    });

    describe("partner pane sync", () => {
        it("follows the partner's viewport and plane", async () => {
            await startMergePane();
            const viewport = { x: 1, y: 2, width: 300, height: 200 };

            dispatch(new SyncViewportQuery(viewport));
            dispatch(new SyncDiffPlaneQuery("Sub_Ship"));

            expect(viewer().setViewport).toHaveBeenCalledWith(viewport);
            expect(viewer().showPlane).toHaveBeenCalledWith("Sub_Ship");
        });
    });
});
