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
        viewport: Viewport = { x: 0, y: 0, width: 2000, height: 1500 };
        getViewport = vi.fn(() => ({ ...this.viewport }));
        setViewport = vi.fn();
        hasElement = vi.fn((id: string) => this.drawn.has(id));
        showPlane = vi.fn((_planeId: string) => true);
        mirrorSelection = vi.fn();
        onPlaneChanged = vi.fn();
        viewportListener: ((viewport: Viewport) => void) | undefined;
        onViewportChanged = vi.fn((listener: (viewport: Viewport) => void) => {
            this.viewportListener = listener;
        });
        selectionListeners: ((elementId: string | undefined) => void)[] = [];
        onSelectedElementChanged = vi.fn((listener: (elementId: string | undefined) => void) => {
            this.selectionListeners.push(listener);
        });
        /** The user clicks an element, as diagram-js reports it. */
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
                  decisionsOf(id: string): readonly { kind: string }[];
                  decide(id: string, decision: object): void;
                  attach(provider: { refresh(): void }): void;
              }
            | undefined,
        provider: { refresh: vi.fn(), padBox: vi.fn(() => undefined) },
    };
    const names = {
        nameOf: (id: string) => ({ Task_Pack: "Pack parcel" })[id] as string | undefined,
        flowEndsOf: (id: string) =>
            id === "Flow_1" ? { source: "Task_Check", target: "Task_Pack" } : undefined,
    };
    const card = {
        shownAt: undefined as string | undefined,
        show: vi.fn(
            (content: { elementId: string; offer?: { text: string } }, _actions: object) => {
                const drawn = ["Task_Check", "Task_Pack", "Flow_1"].includes(content.elementId);
                card.shownAt = drawn ? content.elementId : undefined;
                return drawn;
            },
        ),
        close: vi.fn(() => {
            card.shownAt = undefined;
        }),
    };
    return { FakeDiffViewer, FakeDiffSideLabel, marks, elementXmlChanges, pickPad, names, card };
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

vi.mock("./mergeOutcomeCard", () => ({
    createMergeOutcomeCardModule: (config: { attach(card: typeof fakes.card): void }) => {
        config.attach(fakes.card);
        return { mergeOutcomeCard: ["value", fakes.card] };
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

// The right pane by default: only it has the stepper, the "…" menu and Build.
function mergeStates(
    states: Partial<MergePaneStates> = {},
    elementXmlChanges = false,
    side: "before" | "after" = "after",
) {
    return new ApplyMergeStatesQuery(side, { ...STATES, ...states }, elementXmlChanges);
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
    const openMenu = () =>
        legendParent.querySelector<HTMLButtonElement>(".merge-bar__more")?.click();

    async function startMergePane(): Promise<MergeMode> {
        const mergeMode = new MergeMode(document.createElement("div"), legendParent, host);
        await mergeMode.startWith("<current />");
        return mergeMode;
    }

    beforeEach(() => {
        // jsdom lays nothing out, so it has no scrolling either.
        Element.prototype.scrollIntoView ??= () => undefined;
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
        fakes.card.show.mockClear();
        fakes.card.close.mockClear();
        fakes.card.shownAt = undefined;
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
            expect(document.body.dataset.diffSide).toBe("after");
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

        it("labels the pane with its side's caption in its bar, not on the canvas", async () => {
            await startMergePane();

            dispatch(mergeStates({}, false, "before"));

            expect(legendText()).toContain("Current: your branch main · 1111111");
            expect(fakes.FakeDiffSideLabel.last).toBeUndefined();
        });

        it("shows the open conflicts and the pane's marker counts as the host counts them", async () => {
            await startMergePane();

            dispatch(mergeStates());

            expect(
                legendParent
                    .querySelector(".diff-legend__position")
                    ?.getAttribute("data-merge-tooltip"),
            ).toBe("3 open conflicts");
            expect(legendText()).toContain("–/3");
            expect(legendText()).toContain("Taken from this side 1");
            expect(legendText()).toContain("Conflict 2");
        });

        it("shows the stepper only on the right pane", async () => {
            await startMergePane();

            dispatch(mergeStates({}, false, "before"));

            expect(legendButton("Next change").closest("[hidden]")).not.toBeNull();
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

        it("selects the stepped element, so its context pad opens where the step lands", async () => {
            await startMergePane();
            dispatch(mergeStates());

            next();

            expect(viewer().mirrorSelection).toHaveBeenLastCalledWith("Task_Pack");
        });

        it("selects nothing on a step this pane does not draw", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();

            next();

            expect(viewer().mirrorSelection).toHaveBeenLastCalledWith(undefined);
        });

        it("makes an element of the walked list the step when the user clicks it, without echoing the selection", async () => {
            await startMergePane();
            dispatch(mergeStates({ stepping: { list: "all" } }));
            viewer().mirrorSelection.mockClear();

            viewer().userSelects("Flow_1");

            expect(cursorsPosted()).toEqual([1]);
            expect(legendText()).toContain("2/5");
            expect(viewer().mirrorSelection).not.toHaveBeenCalled();
        });

        it("keeps the step when the user clicks an element outside the walked list or the step itself", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();

            viewer().userSelects("Task_Check");
            viewer().userSelects("Task_Pack");

            expect(cursorsPosted()).toEqual([2]);
        });

        it("closes the outcome card when the user selects another element", async () => {
            await startMergePane();
            fakes.card.shownAt = "Task_Pack";

            viewer().userSelects("Task_Pack");
            expect(fakes.card.close).not.toHaveBeenCalled();
            viewer().userSelects("Task_Check");
            expect(fakes.card.close).toHaveBeenCalled();
        });

        it("opens the menu at a shape-less step, keeping the keyboard on the stepper", async () => {
            await startMergePane();
            dispatch(mergeStates());
            const previousButton = legendButton("Prev change");
            previousButton.focus();

            previousButton.click();

            expect(legendParent.querySelector(".merge-menu")?.closest("[hidden]")).toBeNull();
            expect(document.activeElement).toBe(previousButton);
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
            openMenu();
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
            openMenu();
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
            expect(legendButton("All merged elements").getAttribute("aria-checked")).toBe("true");
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
            expect(legendButton("All merged elements").getAttribute("aria-checked")).toBe("true");
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
            expect(legendText()).not.toContain("Not in this version");
        });

        it("stops the viewport sync on a step whose plane this version lacks", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: SUB_STEPS }));
            viewer().showPlane.mockReturnValueOnce(false);

            dispatch(new SyncCursorQuery(5));
            viewer().viewportListener?.({ x: 0, y: 0, width: 10, height: 10 });

            expect(legendText()).toContain("Not in this version");
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

    describe("viewport on a step", () => {
        const viewportsPosted = () =>
            posted()
                .filter((message) => message.type === "ViewportChangedCommand")
                .map((message) => (message as { viewport: object }).viewport);
        const onlyHere = (id: string) => step(id, false, true, undefined, false);

        it("zooms in to 100 %, around the step, where the pane shows the diagram smaller", async () => {
            const canvas = document.createElement("div");
            Object.defineProperties(canvas, {
                clientWidth: { value: 800 },
                clientHeight: { value: 600 },
            });
            const mergeMode = new MergeMode(canvas, legendParent, host);
            await mergeMode.startWith("<current />");
            dispatch(mergeStates());

            next();

            expect(viewer().setViewport).toHaveBeenCalledWith({
                x: 600,
                y: 450,
                width: 800,
                height: 600,
            });
        });

        it("hands its viewport to the partner, after the cursor, on a step only this pane draws", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    openConflictSteps: [onlyHere("Task_Pack")],
                    allSteps: [onlyHere("Task_Pack")],
                }),
            );

            next();

            const types = posted().map((message) => message.type);
            expect(types.indexOf("ViewportChangedCommand")).toBeGreaterThan(
                types.indexOf("CursorChangedCommand"),
            );
            expect(viewportsPosted()).toEqual([viewer().viewport]);
        });

        it("hands its viewport to the partner on the partner's step to an element only this pane draws", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: [step("Task_Check"), onlyHere("Task_Pack")] }));

            dispatch(new SyncCursorQuery(1));

            expect(viewportsPosted()).toEqual([viewer().viewport]);
        });

        it("keeps its viewport to itself on a step both panes draw, or one only the partner draws", async () => {
            await startMergePane();
            dispatch(mergeStates());

            next();
            next();

            expect(viewportsPosted()).toEqual([]);
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

        // spike: old header
        it.skip("keeps the stepped element from this pane's side through the legend", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();

            legendButton("Keep current").click();

            expect(picksPosted()).toEqual([
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    elementId: "Task_Pack",
                    scope: "element",
                }),
            ]);
        });

        // spike: old header
        it.skip("offers no pick action before the first step", async () => {
            await startMergePane();
            dispatch(mergeStates());

            expect(legendButton("Keep current").closest<HTMLElement>("[hidden]")).not.toBeNull();
        });

        it("keeps a shape-less element from either side, and undoes its pick, in its menu row", async () => {
            await startMergePane();
            dispatch(mergeStates());
            expect(legendText()).not.toContain("Undo pick");

            legendButton("Keep current").click();
            dispatch(
                mergeStates({
                    picksNotDrawn: [{ id: "Process_1", keptSide: "incoming", scope: "element" }],
                }),
            );
            legendButton("Keep incoming").click();
            legendButton("Undo pick").click();

            expect(legendButton("Keep incoming").getAttribute("aria-pressed")).toBe("true");
            expect(picksPosted()).toEqual([
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    elementId: "Process_1",
                    scope: "element",
                    side: "current",
                }),
                expect.objectContaining({
                    type: "UnpickMergeCommand",
                    elementId: "Process_1",
                    scope: "element",
                }),
            ]);
        });

        it("counts the open conflicts without a shape on the menu button", async () => {
            await startMergePane();

            dispatch(mergeStates());

            expect(legendParent.querySelector(".merge-bar__badge")?.textContent).toBe("1");
            expect(
                legendButton("More merge actions, 1 open conflict not visible in the diagram"),
            ).toBeDefined();
        });

        // spike: old header
        it.skip("undoes a pick this pane cannot draw from its list of the user's picks", async () => {
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

        // spike: old header
        it.skip("stays on the stepped element and keeps the focus on its action after a pick", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();
            const keep = legendButton("Keep current");
            keep.focus();
            keep.click();

            dispatch(
                mergeStates({
                    openConflictSteps: [step("Task_Gone", false, false), step("Process_1", true)],
                    pickable: [{ id: "Task_Pack", container: false, undo: "element" }],
                    badges: [
                        {
                            id: "Task_Pack",
                            kind: "keptHere",
                            keptSide: "current",
                            scope: "element",
                        },
                    ],
                }),
            );

            expect(document.activeElement).toBe(keep);
            expect(legendButton("Undo pick").hidden).toBe(false);
            next();
            expect(cursorsPosted().at(-1)).toBe(3);
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

        it("offers the pad's decisions from the latest states and posts them with their side", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    caption: { side: "incoming", role: "upstream", ref: "feature" },
                    pickable: [
                        {
                            id: "Task_Pack",
                            container: false,
                            removedByOtherSide: true,
                            undo: "element",
                        },
                    ],
                }),
            );

            const decisions = fakes.pickPad.config?.decisionsOf("Task_Pack") ?? [];
            expect(decisions.map(({ kind }) => kind)).toEqual(["keep", "leaveOut", "undo"]);
            expect(fakes.pickPad.config?.decisionsOf("Task_Check")).toEqual([]);
            for (const decision of decisions) fakes.pickPad.config?.decide("Task_Pack", decision);
            fakes.pickPad.config?.decide("Task_Pack", {
                kind: "keepRemovedFlows",
                side: "incoming",
                offer: { elementId: "Task_Pack", connections: ["Flow_1"], removedBy: "current" },
            });

            expect(picksPosted()).toEqual([
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    side: "incoming",
                    scope: "element",
                }),
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    side: "current",
                    scope: "element",
                }),
                expect.objectContaining({ type: "UnpickMergeCommand", scope: "element" }),
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    side: "incoming",
                    scope: "withConnections",
                }),
            ]);
        });

        const KEPT_FLOW = {
            applied: true,
            action: "pick",
            elementId: "Flow_1",
            pulledIn: ["Task_Pack"],
            dropped: [],
            reopened: ["Task_Check"],
        } as const;
        const cardShown = () => fakes.card.show.mock.lastCall?.[0];
        const cardActions = () =>
            fakes.card.show.mock.lastCall?.[1] as {
                onSelect(id: string): void;
                onKeepRemovedFlows(id: string): void;
            };

        it("shows what this pane's last pick did as a card at the element, naming the side and an unnamed flow by its ends", async () => {
            await startMergePane();
            dispatch(mergeStates({ caption: { side: "incoming", role: "upstream" } }));
            fakes.pickPad.config?.decide("Flow_1", {
                kind: "keep",
                scope: "element",
                side: "incoming",
            });

            dispatch(mergeStates({ lastOutcome: KEPT_FLOW }));

            expect(cardShown()).toEqual(
                expect.objectContaining({
                    applied: true,
                    elementId: "Flow_1",
                    headline: "Kept from incoming: Flow from Task_Check to Pack parcel",
                    rows: [
                        { label: "Pulled in:", elementIds: ["Task_Pack"] },
                        { label: "Open again:", elementIds: ["Task_Check"] },
                    ],
                }),
            );
        });

        it("shows no card on the partner pane, which sent no pick", async () => {
            await startMergePane();

            dispatch(mergeStates({ lastOutcome: KEPT_FLOW }));

            expect(fakes.card.show).not.toHaveBeenCalled();
        });

        it("shows the card once, not again on later states", async () => {
            await startMergePane();
            dispatch(mergeStates());
            fakes.pickPad.config?.decide("Flow_1", {
                kind: "keep",
                scope: "element",
                side: "incoming",
            });
            dispatch(mergeStates({ lastOutcome: KEPT_FLOW }));

            dispatch(mergeStates({ lastOutcome: KEPT_FLOW }));

            expect(fakes.card.show).toHaveBeenCalledOnce();
        });

        it("keeps the card open on a step its own link makes, and closes it on any other step", async () => {
            await startMergePane();
            dispatch(mergeStates());
            fakes.pickPad.config?.decide("Flow_1", {
                kind: "keep",
                scope: "element",
                side: "incoming",
            });
            dispatch(mergeStates({ lastOutcome: KEPT_FLOW }));

            cardActions().onSelect("Task_Pack");
            expect(fakes.card.close).not.toHaveBeenCalled();
            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");

            next();
            expect(fakes.card.close).toHaveBeenCalled();
        });

        it("names the element that blocks a pick and why", async () => {
            await startMergePane();
            dispatch(mergeStates());
            fakes.pickPad.config?.decide("Task_Check", {
                kind: "keep",
                scope: "element",
                side: "current",
            });

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

            expect(cardShown()).toEqual(
                expect.objectContaining({
                    headline: "Cannot keep Task_Check",
                    reasons: ["Pack parcel, which you picked, needs Task_Check"],
                    blockers: ["Task_Pack"],
                }),
            );
        });

        it("shows what a shape-less row's pick did in its row, as no canvas draws it", async () => {
            await startMergePane();
            dispatch(mergeStates());
            openMenu();
            legendButton("Keep incoming").click();

            dispatch(
                mergeStates({
                    lastOutcome: {
                        applied: true,
                        action: "pick",
                        elementId: "Process_1",
                        pulledIn: [],
                        dropped: [],
                        reopened: [],
                    },
                }),
            );

            expect(legendText()).toContain("Kept from incoming: Process_1");
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
                    build: {
                        ...STATES.build,
                        built: true,
                        notes: [
                            {
                                kind: "restoredWithoutConnections",
                                id: "Task_Gone",
                                connections: ["Task_Pack", "Task_Check"],
                            },
                        ],
                    },
                    names: { Task_Gone: "Reject order", Task_Pack: "Pack box" },
                }),
            );

            expect(legendText()).toContain(
                "Reject order is kept without the flows the other side removed with it: Pack box, Task_Check",
            );
        });

        // spike: old header
        it.skip("moves the focus to the Keep action when Undo of the stepped element hides itself", async () => {
            await startMergePane();
            dispatch(
                mergeStates({ pickable: [{ id: "Task_Pack", container: false, undo: "element" }] }),
            );
            next();
            const undo = legendButton("Undo pick");
            undo.focus();
            undo.click();

            dispatch(mergeStates({ pickable: [{ id: "Task_Pack", container: false }] }));

            expect(document.activeElement).toBe(legendButton("Keep current"));
        });

        // spike: old header
        it.skip("moves the focus to what the undo did when it removes the listed pick it was on", async () => {
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

        // spike: old header
        it.skip("keeps what the last pick did in place while the stepper moves, so it is announced once", async () => {
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

        it("offers to keep the flows removed with a kept element in one step, on its card", async () => {
            await startMergePane();
            dispatch(mergeStates());
            fakes.pickPad.config?.decide("Task_Pack", {
                kind: "keep",
                scope: "element",
                side: "incoming",
            });
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
                    restoreOffer: {
                        elementId: "Task_Pack",
                        connections: ["Flow_2", "Flow_3"],
                        removedBy: "current",
                    },
                }),
            );
            host.postMessage.mockClear();

            expect(cardShown()?.offer?.text).toBe("Also keep the 2 flows current removed with it");
            cardActions().onKeepRemovedFlows("Task_Pack");

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
            [...legendParent.querySelectorAll<HTMLElement>(".merge-bar__actions *")]
                .filter(
                    (element) =>
                        element.closest("[hidden]") === null && element.children.length === 0,
                )
                .map((element) => element.textContent)
                .join(" ");
        it("offers Build on the right pane only, disabled while conflicts are left", async () => {
            await startMergePane();
            dispatch(mergeStates({}, false, "before"));
            expect(legendButton("Build").closest("[hidden]")).not.toBeNull();

            dispatch(afterStates({}));

            expect(legendButton("Build").disabled).toBe(true);
            expect(legendButton("Build").closest("[hidden]")).toBeNull();
            expect(
                legendParent
                    .querySelector(".merge-bar__build-wrap")
                    ?.getAttribute("data-merge-tooltip"),
            ).toBe("3 conflicts left");
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
                "Pack parcel is kept without the flows the other side removed with it: Flow from Task_Check to Pack parcel",
            );
            legendButton("Pack parcel").click();
            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
        });

        it("offers no notes before a build or after one with none", async () => {
            await startMergePane();
            dispatch(afterStates({ canBuild: true, openConflicts: 0, built: true }));

            expect(legendButton("Review notes (0)").disabled).toBe(true);
            expect(legendButton("Compare with incoming").disabled).toBe(false);
        });
    });
});
