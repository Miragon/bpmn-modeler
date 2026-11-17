import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
    ApplyMergeStatesQuery,
    type MergePaneStates,
    type MergePaneStep,
    type MergePaneStepList,
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
        mirrorSelection = vi.fn((_id: string | undefined) => true);
        getViewport = vi.fn(() => ({ x: 10, y: 20, width: 400, height: 300 }));
        onPlaneChanged = vi.fn();
        viewportListener: ((viewport: Viewport) => void) | undefined;
        onViewportChanged = vi.fn((listener: (viewport: Viewport) => void) => {
            this.viewportListener = listener;
        });
        selectionListeners: ((elementId: string | undefined) => void)[] = [];
        onSelectedElementChanged = vi.fn((listener: (elementId: string | undefined) => void) => {
            this.selectionListeners.push(listener);
        });
        /** The user selects on the canvas, as diagram-js reports it. */
        userSelects(elementId: string | undefined): void {
            for (const listener of this.selectionListeners) listener(elementId);
        }
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
    const pickPad = {
        config: undefined as
            | {
                  decisionsOf(id: string): readonly unknown[];
                  decide(id: string, decision: unknown): void;
                  attach(provider: { refresh(): void }): void;
              }
            | undefined,
        provider: { refresh: vi.fn() },
    };
    const names = { nameOf: (id: string) => ({ Task_Pack: "Pack parcel" })[id] ?? id };
    return { FakeDiffViewer, FakeDiffSideLabel, marks, elementXmlChanges, pickPad, names };
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

vi.mock("./mergePickContextPad", () => ({
    createMergePickModule: (config: NonNullable<typeof fakes.pickPad.config>) => {
        fakes.pickPad.config = config;
        config.attach(fakes.pickPad.provider);
        return { mergePickEntryConfig: ["value", config] };
    },
}));

vi.mock("./mergeElementNames", () => ({
    createMergeElementNamesModule: (config: { attach(names: typeof fakes.names): void }) => {
        config.attach(fakes.names);
        return { mergeElementNames: ["value", fakes.names] };
    },
}));

vi.mock("./mergeMarks", () => ({
    createMergeMarksModule: (config: { attach(marks: typeof fakes.marks): void }) => {
        config.attach(fakes.marks);
        return { mergeMarks: ["value", fakes.marks] };
    },
}));

import type { MergeStepList } from "../../domain/mergeStepper";
import { MergeMode } from "./mergeMode";

const viewer = () => fakes.FakeDiffViewer.last;

const step = (
    id: string,
    shapeless = false,
    onThisPane = true,
    plane?: string,
    onOtherPane = true,
): MergePaneStep => ({
    id,
    shapeless,
    onThisPane,
    onOtherPane,
    ...(plane === undefined ? {} : { plane }),
});

const STATES: MergePaneStates = {
    caption: { side: "current", role: "branch", ref: "main", shortHash: "1111111" },
    marks: {
        takenFromThisSide: ["Task_Check"],
        takenFromOtherSide: ["Flow_1"],
        conflict: ["Task_Pack"],
    },
    shapeless: [{ id: "Process_1", type: "bpmn:Process", marker: "conflict" }],
    counts: { takenFromThisSide: 1, takenFromOtherSide: 1, conflict: 2 },
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
    stepping: { list: "openConflicts" },
    badges: [],
    picksNotDrawn: [],
    consequences: [],
    pickable: [
        { id: "Task_Check", container: false },
        { id: "Flow_1", container: false },
        { id: "Task_Pack", container: false },
        { id: "Task_Gone", container: false },
        { id: "Process_1", container: true },
    ],
    names: {},
    build: { canBuild: false, openConflicts: 3, built: false, notes: [] },
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
    const counter = () => {
        const position = legendParent.querySelector<HTMLElement>(".diff-legend__position");
        return position && !position.hidden ? position.textContent : undefined;
    };

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

            expect(fakes.marks.paint).toHaveBeenCalledWith(
                { marks: STATES.marks, badges: [], consequences: [] },
                expect.objectContaining({ conflict: "Conflict" }),
            );
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

        it("shows the open conflicts and the pane's marker counts as the host counts them", async () => {
            await startMergePane();

            dispatch(mergeStates());

            expect(legendText()).toContain("3 open conflicts");
            expect(legendText()).toContain("Taken from this side 1");
            expect(legendText()).toContain("Conflict 2");
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

        it("keeps the keyboard on a legend entry it steps to", async () => {
            await startMergePane();
            dispatch(mergeStates());
            const entry = () =>
                legendParent.querySelector<HTMLButtonElement>('[data-element-id="Process_1"]');
            entry()?.focus();

            entry()?.click();

            expect(document.activeElement).toBe(entry());
            expect(entry()?.getAttribute("aria-current")).toBe("true");
        });

        it("keeps the keyboard on its legend entry when the listed elements change", async () => {
            await startMergePane();
            dispatch(mergeStates());
            legendParent.querySelector<HTMLButtonElement>('[data-element-id="Process_1"]')?.focus();

            dispatch(
                mergeStates({
                    shapeless: [
                        ...STATES.shapeless,
                        { id: "Message_1", type: "bpmn:Message", marker: "takenFromThisSide" },
                    ],
                }),
            );

            expect(document.activeElement).toBe(
                legendParent.querySelector('[data-element-id="Process_1"]'),
            );
            expect(legendParent.querySelectorAll("[data-element-id]")).toHaveLength(2);
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

        it("tells the host which list it steps through, so the partner walks it too", async () => {
            await startMergePane();
            dispatch(mergeStates());

            legendButton("All merged elements").click();

            expect(posted()).toContainEqual(
                expect.objectContaining({ type: "MergeStepListChangedCommand", list: "all" }),
            );
        });

        it("walks the list the host sends", async () => {
            await startMergePane();
            dispatch(mergeStates({ stepping: { list: "all" } }));

            next();

            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Check");
            expect(legendButton("All merged elements").getAttribute("aria-pressed")).toBe("true");
        });

        it("goes back to the step the host kept, as after a tab switch, without echoing it", async () => {
            await startMergePane();

            dispatch(mergeStates({ stepping: { list: "openConflicts", cursor: "Task_Pack" } }));

            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
            expect(cursorsPosted()).toEqual([]);
            expect(legendText()).toContain("1/3");
        });

        it("keeps the step list's type equal to the protocol's", () => {
            expectTypeOf<MergeStepList>().toEqualTypeOf<MergePaneStepList>();
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
            expect(counter()).toBe("1/3");
            next();

            expect(cursorsPosted()).toEqual([2, 3]);
            expect(counter()).toBe("1/2");
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

    describe("the step's selection", () => {
        const selected = () => viewer().mirrorSelection.mock.calls.map(([id]) => id);

        it("selects the element a step lands on, after entering its plane, so its pad opens there", async () => {
            await startMergePane();
            dispatch(mergeStates());

            next();

            expect(selected()).toEqual(["Task_Pack"]);
            expect(viewer().focusElement.mock.invocationCallOrder[0]).toBeLessThan(
                viewer().mirrorSelection.mock.invocationCallOrder[0],
            );
        });

        it("centres the stepped element at the current zoom", async () => {
            await startMergePane();
            dispatch(mergeStates());

            next();

            expect(viewer().setViewport).not.toHaveBeenCalled();
            expect(viewer().fitDiagram).not.toHaveBeenCalled();
        });

        it("selects the partner's step on this pane too, without posting it", async () => {
            await startMergePane();
            dispatch(mergeStates());

            dispatch(new SyncCursorQuery(2));

            expect(selected()).toEqual(["Task_Pack"]);
            expect(posted().map(({ type }) => type)).not.toContain("DiffSelectionChangedCommand");
        });

        it("selects the step the host kept after a reload", async () => {
            await startMergePane();

            dispatch(mergeStates({ stepping: { list: "openConflicts", cursor: "Task_Pack" } }));

            expect(selected()).toEqual(["Task_Pack"]);
        });

        it("clears the selection and its pad on a step this pane does not draw", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();

            next();

            expect(selected()).toEqual(["Task_Pack", undefined]);
            expect(viewer().clearSelectionMarker).toHaveBeenCalled();
        });

        it("clears the selection and its pad on a step without a shape", async () => {
            await startMergePane();
            dispatch(mergeStates());

            previous();

            expect(selected()).toEqual([undefined]);
        });

        it("makes a clicked element of the merge the step on both panes", async () => {
            await startMergePane();
            dispatch(mergeStates());

            viewer().userSelects("Task_Check");

            expect(cursorsPosted()).toEqual([0]);
            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Check");
            expect(selected()).toEqual(["Task_Check"]);
            expect(counter()).toBe("1/4");
        });

        it.each([
            ["an element that is no step", "Task_Other", {}],
            ["nothing", undefined, {}],
            ["a step the user cannot pick", "Task_Check", { pickable: [] }],
        ])("leaves the step where it is on a click on %s", async (_case, clicked, states) => {
            await startMergePane();
            dispatch(mergeStates(states));

            viewer().userSelects(clicked);

            expect(cursorsPosted()).toEqual([]);
            expect(viewer().focusElement).not.toHaveBeenCalled();
        });

        it("posts no step again on a click on the element it is on", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();

            viewer().userSelects("Task_Pack");

            expect(cursorsPosted()).toEqual([2]);
        });
    });

    describe("a step only one pane draws", () => {
        const ONLY_HERE: MergePaneStates["allSteps"] = [
            step("Task_Check", false, true, undefined, false),
            step("Flow_1"),
            step("Task_Pack"),
            step("Task_Gone", false, false),
            step("Process_1", true),
        ];
        const viewportsPosted = () =>
            posted().filter((message) => message.type === "ViewportChangedCommand");

        it("hands this pane's viewport to the partner after this pane's step", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: ONLY_HERE, stepping: { list: "all" } }));

            next();

            expect(
                posted()
                    .map(({ type }) => type)
                    .slice(-2),
            ).toEqual(["CursorChangedCommand", "ViewportChangedCommand"]);
            expect(viewportsPosted()).toEqual([
                expect.objectContaining({ viewport: { x: 10, y: 20, width: 400, height: 300 } }),
            ]);
        });

        it("hands this pane's viewport to the partner after the partner's step", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: ONLY_HERE }));

            dispatch(new SyncCursorQuery(0));

            expect(viewportsPosted()).toHaveLength(1);
        });

        it("hands over no viewport on a step both panes draw, one only the partner draws, or one without a shape", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: ONLY_HERE }));

            for (const index of [1, 2, 3, 4]) dispatch(new SyncCursorQuery(index));

            expect(viewportsPosted()).toEqual([]);
        });
    });

    describe("planes", () => {
        const SUB_STEPS = [
            ...STATES.allSteps,
            step("Task_Sub", false, false, "Sub_Ship"),
            step("Task_Mine", false, true, "Sub_Ship"),
        ];

        it("enters the sub-process plane of a step only the partner draws", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: SUB_STEPS }));

            dispatch(new SyncCursorQuery(5));

            expect(viewer().showPlane).toHaveBeenLastCalledWith("Sub_Ship");
            expect(fakes.FakeDiffSideLabel.last?.showPlaneMissing).toHaveBeenLastCalledWith(false);
        });

        it("stops the viewport sync on a step whose plane this version lacks", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: SUB_STEPS }));
            viewer().showPlane.mockReturnValueOnce(false);

            dispatch(new SyncCursorQuery(5));
            viewer().viewportListener?.({ x: 0, y: 0, width: 10, height: 10 });

            expect(fakes.FakeDiffSideLabel.last?.showPlaneMissing).toHaveBeenLastCalledWith(true);
            expect(posted().map(({ type }) => type)).not.toContain("ViewportChangedCommand");
        });

        it("goes back to the opening plane for a step the partner draws there", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: SUB_STEPS }));
            viewer().drawn.add("Task_Mine");
            dispatch(new SyncCursorQuery(6));
            viewer().showPlane.mockClear();

            dispatch(new SyncCursorQuery(3));

            expect(viewer().showPlane).toHaveBeenCalledWith("");
        });

        it("leaves the plane alone for a step the partner draws on the plane this pane shows", async () => {
            await startMergePane();
            dispatch(mergeStates());

            dispatch(new SyncCursorQuery(3));

            expect(viewer().showPlane).not.toHaveBeenCalled();
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

    describe("picks", () => {
        const picksPosted = () =>
            posted().filter(
                (message) =>
                    message.type === "PickMergeSideCommand" ||
                    message.type === "UnpickMergeCommand",
            );

        it("keeps a stepped element without a shape from this pane's side through the legend", async () => {
            await startMergePane();
            dispatch(mergeStates());
            previous();

            legendButton("Keep current").click();

            expect(picksPosted()).toEqual([
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    elementId: "Process_1",
                    scope: "element",
                }),
            ]);
        });

        it("offers the legend's pick actions only on a step without a shape: the pad decides the rest", async () => {
            const keepHidden = () =>
                legendButton("Keep current").closest<HTMLElement>("[hidden]") !== null;
            await startMergePane();
            dispatch(mergeStates());
            expect(keepHidden()).toBe(true);

            next();
            expect(keepHidden()).toBe(true);

            previous();
            expect(keepHidden()).toBe(false);
        });

        it("keeps a shape-less entry with everything inside, and undoes its pick, through the legend", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    pickable: [{ id: "Process_1", container: true, undo: "withContents" }],
                }),
            );
            legendButton("Process_1 (Process)").click();

            legendButton("Keep everything inside").click();
            legendButton("Undo pick").click();

            expect(picksPosted()).toEqual([
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    elementId: "Process_1",
                    scope: "withContents",
                }),
                expect.objectContaining({
                    type: "UnpickMergeCommand",
                    elementId: "Process_1",
                    scope: "withContents",
                }),
            ]);
        });

        it("undoes a pick this pane cannot draw from its list of the user's picks", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    picksNotDrawn: [
                        { id: "Task_Pack", keptSide: "incoming", scope: "withConnections" },
                    ],
                }),
            );

            expect(legendText()).toContain("Your picks");
            expect(legendText()).toContain("Kept from incoming: Pack parcel");
            legendButton("Undo pick: Kept from incoming: Pack parcel").click();

            expect(picksPosted()).toEqual([
                expect.objectContaining({
                    type: "UnpickMergeCommand",
                    elementId: "Task_Pack",
                    scope: "withConnections",
                }),
            ]);
        });

        it("stays on a stepped element without a shape and keeps the focus on its action after a pick", async () => {
            await startMergePane();
            dispatch(mergeStates());
            previous();
            const keep = legendButton("Keep current");
            keep.focus();
            keep.click();

            dispatch(
                mergeStates({
                    openConflictSteps: [step("Task_Pack"), step("Task_Gone", false, false)],
                    pickable: [{ id: "Process_1", container: true, undo: "element" }],
                }),
            );

            expect(document.activeElement).toBe(keep);
            expect(legendButton("Undo pick").hidden).toBe(false);
            expect(counter()).toBe("3/3");
            previous();
            expect(cursorsPosted().at(-1)).toBe(3);
            expect(counter()).toBe("2/2");
        });

        it("paints the user's picks and their consequences, with the badges' words", async () => {
            await startMergePane();
            const badge = {
                id: "Task_Pack",
                kind: "keptHere",
                keptSide: "current",
                scope: "element",
            } as const;

            dispatch(mergeStates({ badges: [badge], consequences: ["Flow_1"] }));

            const [view, labels] = fakes.marks.paint.mock.lastCall!;
            expect(view).toEqual({
                marks: STATES.marks,
                badges: [badge],
                consequences: ["Flow_1"],
            });
            expect(labels.badge(badge)).toEqual({
                side: "Current",
                label: "Kept from current, your pick",
            });
        });

        it("offers the pad's decisions from the latest states and posts each with its side", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    pickable: [
                        {
                            id: "Task_Pack",
                            container: false,
                            undo: "element",
                            otherSideLacks: "removed",
                        },
                    ],
                    restoreOffer: {
                        elementId: "Task_Pack",
                        connections: ["Flow_1"],
                        removedBy: "incoming",
                    },
                }),
            );
            const pad = fakes.pickPad.config!;

            const decisions = pad.decisionsOf("Task_Pack");
            for (const decision of decisions) pad.decide("Task_Pack", decision);

            expect(pad.decisionsOf("Task_Check")).toEqual([]);
            expect(
                picksPosted().map((message) => ({
                    type: message.type,
                    scope: (message as { scope: string }).scope,
                    side: (message as { side?: string }).side,
                })),
            ).toEqual([
                { type: "PickMergeSideCommand", scope: "element", side: "current" },
                { type: "PickMergeSideCommand", scope: "element", side: "incoming" },
                { type: "PickMergeSideCommand", scope: "withConnections", side: "current" },
                { type: "UnpickMergeCommand", scope: "element", side: undefined },
            ]);
        });

        it("shows what the last pick did and selects an element it names", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    lastOutcome: {
                        applied: true,
                        action: "pick",
                        elementId: "Flow_1",
                        pulledIn: ["Task_Pack"],
                        dropped: [],
                        reopened: ["Task_Check"],
                    },
                }),
            );

            expect(legendText()).toContain("Kept Flow_1");
            expect(legendText()).toContain("Pulled in:");
            expect(legendText()).toContain("Open again:");
            legendButton("Pack parcel").click();

            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
        });

        it("names the element that blocks a pick and why", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    lastOutcome: {
                        applied: false,
                        action: "pick",
                        elementId: "Task_Check",
                        blockedBy: [
                            {
                                elementId: "Task_Pack",
                                targetId: "Task_Check",
                                obstacle: "dependentPicked",
                            },
                        ],
                    },
                }),
            );

            expect(legendText()).toContain("Cannot keep Task_Check");
            expect(legendText()).toContain("Pack parcel, which you picked, needs Task_Check");
        });

        it("refreshes an open pick pad with every state, so its entries follow the host", async () => {
            await startMergePane();
            fakes.pickPad.provider.refresh.mockClear();

            dispatch(mergeStates());

            expect(fakes.pickPad.provider.refresh).toHaveBeenCalledOnce();
        });

        it("names an element as the host names it, the canvas only where the host does not", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    picksNotDrawn: [
                        { id: "Task_Gone", keptSide: "incoming", scope: "element" },
                        { id: "Task_Pack", keptSide: "incoming", scope: "element" },
                        { id: "Task_Check", keptSide: "incoming", scope: "element" },
                    ],
                    names: { Task_Gone: "Reject order", Task_Pack: "Pack box" },
                }),
            );

            expect(legendText()).toContain("Kept from incoming: Reject order");
            expect(legendText()).toContain("Kept from incoming: Pack box");
            expect(legendText()).toContain("Kept from incoming: Task_Check");
        });

        it("moves the focus to the Keep action when Undo of a stepped element without a shape hides itself", async () => {
            await startMergePane();
            dispatch(
                mergeStates({ pickable: [{ id: "Process_1", container: true, undo: "element" }] }),
            );
            previous();
            const undo = legendButton("Undo pick");
            undo.focus();
            undo.click();

            dispatch(mergeStates({ pickable: [{ id: "Process_1", container: true }] }));

            expect(document.activeElement).toBe(legendButton("Keep current"));
        });

        it("moves the focus to what the undo did when it removes the listed pick it was on", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    picksNotDrawn: [{ id: "Task_Gone", keptSide: "incoming", scope: "element" }],
                }),
            );
            const undo = legendButton("Undo pick: Kept from incoming: Task_Gone");
            undo.focus();
            undo.click();

            dispatch(
                mergeStates({
                    lastOutcome: {
                        applied: true,
                        action: "unpick",
                        elementId: "Task_Gone",
                        pulledIn: [],
                        dropped: [],
                        reopened: [],
                    },
                }),
            );

            expect(document.activeElement?.textContent).toBe("Took back the pick of Task_Gone");
        });

        it("keeps what the last pick did in place while the stepper moves, so it is announced once", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    lastOutcome: {
                        applied: true,
                        action: "pick",
                        elementId: "Task_Pack",
                        pulledIn: [],
                        dropped: [],
                        reopened: [],
                    },
                }),
            );
            const status = legendParent.querySelector('[role="status"]')!;
            const shown = status.firstElementChild;

            next();
            next();

            expect(status.firstElementChild).toBe(shown);
        });

        it("offers to keep the flows removed with a kept element in one step", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    restoreOffer: {
                        elementId: "Task_Pack",
                        connections: ["Flow_2", "Flow_3"],
                        removedBy: "incoming",
                    },
                }),
            );

            legendButton("Also keep the 2 flows incoming removed with it").click();

            expect(picksPosted()).toEqual([
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    elementId: "Task_Pack",
                    scope: "withConnections",
                }),
            ]);
        });
    });

    describe("build", () => {
        const afterStates = (build: Partial<MergePaneStates["build"]>) =>
            new ApplyMergeStatesQuery(
                "after",
                {
                    ...STATES,
                    caption: { side: "incoming", role: "upstream" },
                    build: { ...STATES.build, ...build },
                },
                false,
            );
        const typesPosted = () => posted().map((message) => message.type);
        const shownText = () =>
            [...legendParent.querySelectorAll<HTMLElement>(".merge-legend__build *")]
                .filter(
                    (element) =>
                        element.closest("[hidden]") === null && element.children.length === 0,
                )
                .map((element) => element.textContent)
                .join(" ");
        const legendButtons = () =>
            [...legendParent.querySelectorAll("button")].map((button) => button.textContent);

        it("offers Build on the right pane only, disabled while conflicts are left", async () => {
            await startMergePane();
            dispatch(mergeStates());
            expect(legendButtons()).not.toContain("Build");

            dispatch(afterStates({}));

            expect(legendButton("Build").disabled).toBe(true);
            expect(legendText()).toContain("3 conflicts left");
            legendButton("Build").click();
            expect(typesPosted()).not.toContain("BuildMergeResultCommand");
        });

        it("builds once no conflict is open", async () => {
            await startMergePane();
            dispatch(afterStates({ canBuild: true, openConflicts: 0 }));

            legendButton("Build").click();

            expect(shownText()).not.toContain("conflicts left");
            expect(typesPosted()).toContain("BuildMergeResultCommand");
        });

        it("compares the result with either side once one is built", async () => {
            await startMergePane();
            dispatch(afterStates({ canBuild: true, openConflicts: 0 }));
            expect(legendButton("Compare with current").disabled).toBe(true);
            expect(legendButton("Compare with incoming").disabled).toBe(true);

            dispatch(afterStates({ canBuild: true, openConflicts: 0, built: true }));
            legendButton("Compare with current").click();
            legendButton("Compare with incoming").click();

            expect(
                posted()
                    .filter((message) => message.type === "CompareMergeResultCommand")
                    .map((message) => (message as { against: string }).against),
            ).toStrictEqual(["current", "incoming"]);
        });

        it("lists the notes of the build and selects the elements a note names", async () => {
            await startMergePane();
            dispatch(
                afterStates({
                    canBuild: true,
                    openConflicts: 0,
                    built: true,
                    notes: [
                        {
                            kind: "restoredWithoutConnections",
                            id: "Task_Pack",
                            connections: ["Flow_1"],
                        },
                    ],
                }),
            );
            const review = legendButton("Review notes (1)");
            expect(review.getAttribute("aria-expanded")).toBe("false");

            review.click();

            expect(review.getAttribute("aria-expanded")).toBe("true");
            expect(legendText()).toContain(
                "Pack parcel is kept without the flows the other side removed with it: Flow_1",
            );
            legendButton("Pack parcel").click();
            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
        });

        it("lists a layout both sides changed with a button per element it names", async () => {
            await startMergePane();
            dispatch(
                afterStates({
                    canBuild: true,
                    openConflicts: 0,
                    built: true,
                    notes: [
                        {
                            kind: "layoutChangedByBoth",
                            ids: ["Task_Pack", "Task_Check"],
                            keptSide: "incoming",
                        },
                    ],
                }),
            );

            legendButton("Review notes (1)").click();

            expect(legendText()).toContain(
                "Both sides changed the layout of Pack parcel, Task_Check; incoming's is kept",
            );
            legendButton("Pack parcel").click();
            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
            legendButton("Task_Check").click();
            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Check");
        });

        it("offers no notes before a build or after one with none", async () => {
            await startMergePane();
            dispatch(afterStates({ canBuild: true, openConflicts: 0, built: true }));

            expect(shownText()).not.toContain("Review notes");
            expect(shownText()).toContain("Compare with incoming");
        });
    });
});
