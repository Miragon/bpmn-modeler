import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
    ApplyMergeStatesQuery,
    MERGE_PAD_ENTRIES,
    type MergePadEntry,
    type MergePaneCommand,
    type MergePaneStates,
    type MergePaneStep,
    type MergePaneStepList,
    RunMergePaneCommandQuery,
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
        selectStep = vi.fn((_id: string | undefined, _options: { keepInView: boolean }) => true);
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
                  selectionChanged(): void;
              }
            | undefined,
        provider: {
            refresh: vi.fn(),
            selected: undefined as string | undefined,
            selectedElementId(): string | undefined {
                return this.selected;
            },
        },
    };
    const names = { nameOf: (id: string) => ({ Task_Pack: "Pack parcel" })[id] ?? id };

    interface CardContent {
        elementId: string;
        headline: string;
        reasons: readonly string[];
        blockers: readonly string[];
        offer?: { elementId: string; text: string };
        choices?: readonly { action: string; text: string }[];
    }
    interface CardActions {
        onSelect(id: string): void;
        onKeepRemovedWith(id: string): void;
        onChoose(action: string): void;
        closeLabel: string;
    }
    /** The card shows only at an element the pane's canvas draws, as the real one. */
    class FakeOutcomeCard {
        shownAt: string | undefined;
        lastActions: CardActions | undefined;
        show = vi.fn(
            (content: CardContent, actions: CardActions, _options: { announce: boolean }) => {
                this.lastActions = actions;
                const drawn = FakeDiffViewer.last.drawn.has(content.elementId);
                this.shownAt = drawn ? content.elementId : undefined;
                return drawn;
            },
        );
        close = vi.fn(() => {
            this.shownAt = undefined;
        });
        remark = vi.fn();
    }
    const outcomeCard = { current: new FakeOutcomeCard(), FakeOutcomeCard };
    return {
        FakeDiffViewer,
        FakeDiffSideLabel,
        marks,
        elementXmlChanges,
        pickPad,
        names,
        outcomeCard,
    };
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
    createMergeOutcomeCardModule: (config: { attach(card: unknown): void }) => {
        fakes.outcomeCard.current = new fakes.outcomeCard.FakeOutcomeCard();
        config.attach(fakes.outcomeCard.current);
        return { mergeOutcomeCard: ["value", fakes.outcomeCard.current] };
    },
}));

vi.mock("./mergeMarks", () => ({
    createMergeMarksModule: (config: { attach(marks: typeof fakes.marks): void }) => {
        config.attach(fakes.marks);
        return { mergeMarks: ["value", fakes.marks] };
    },
}));

import { padEntryOf } from "../../domain/mergePaneCommands";
import type { MergePadDecision } from "../../domain/mergePadDecisions";
import type { MergeStepList } from "../../domain/mergeStepper";
import { MergeMode } from "./mergeMode";

const viewer = () => fakes.FakeDiffViewer.last;
const card = () => fakes.outcomeCard.current;

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

// No side names the element, and the sides differ in nothing the row lists.
const HELD_BY_BOTH = { current: {}, incoming: {}, differences: [] } as const;

const STATES: MergePaneStates = {
    caption: { side: "incoming", role: "upstream", ref: "feature", shortHash: "2222222" },
    marks: {
        takenFromThisSide: ["Task_Check"],
        takenFromOtherSide: ["Flow_1"],
        conflict: ["Task_Pack"],
    },
    shapelessRows: [
        {
            id: "Process_1",
            type: "bpmn:Process",
            marker: "conflict",
            ...HELD_BY_BOTH,
        },
    ],
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
        { id: "Task_Check" },
        { id: "Flow_1" },
        { id: "Task_Pack" },
        { id: "Task_Gone" },
        { id: "Process_1", container: "contents" },
    ],
    names: {},
    build: { canBuild: false, openConflicts: 3, built: false, notes: [] },
};

/** The right pane's states, which carry the stepper, the menu and Build. */
function mergeStates(
    states: Partial<MergePaneStates> = {},
    elementXmlChanges = false,
    elementXmlMerge = false,
) {
    return new ApplyMergeStatesQuery(
        "after",
        { ...STATES, ...states },
        { elementXmlChanges, elementXmlMerge },
    );
}

/** The left pane's states: the caption and the counts only. */
function leftStates(states: Partial<MergePaneStates> = {}) {
    return new ApplyMergeStatesQuery("before", {
        ...STATES,
        caption: { side: "current", role: "branch", ref: "main", shortHash: "1111111" },
        ...states,
    });
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
    const counter = () => legendParent.querySelector(".merge-bar__position")?.textContent;
    const menu = () => legendParent.querySelector<HTMLElement>(".merge-menu")!;
    const rowOf = (id: string) =>
        legendParent.querySelector<HTMLElement>(`.merge-menu [data-row-for="${id}"]`);
    const rowStep = (id: string) =>
        rowOf(id)?.querySelector<HTMLButtonElement>(".merge-menu__row-step") ?? null;
    // An icon button has no words, so its name is its label.
    const nameOf = (candidate: Element) =>
        candidate.textContent || candidate.getAttribute("aria-label");
    const rowButton = (id: string, text: string) => {
        const found = [
            ...(rowOf(id)?.querySelectorAll<HTMLButtonElement>(".merge-menu__mini") ?? []),
        ].find((candidate) => nameOf(candidate) === text);
        if (!found) throw new Error(`no ${text} in the row of ${id}`);
        return found;
    };
    const rowButtons = (id: string) =>
        [...(rowOf(id)?.querySelectorAll(".merge-menu__mini") ?? [])].map(nameOf);
    const caption = () => legendParent.querySelector(".merge-bar__caption")?.textContent;
    const openMenu = () =>
        legendParent.querySelector<HTMLButtonElement>(".merge-bar__more")?.click();

    async function startMergePane(): Promise<MergeMode> {
        const mergeMode = new MergeMode(document.createElement("div"), legendParent, host);
        await mergeMode.startWith("<current />");
        return mergeMode;
    }

    beforeEach(() => {
        // jsdom lays nothing out, so it has no scrollIntoView.
        Element.prototype.scrollIntoView = vi.fn();
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
        fakes.pickPad.provider.selected = undefined;
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

        it("names the pane's side in its bar, not on the canvas", async () => {
            fakes.FakeDiffSideLabel.last = undefined;
            await startMergePane();

            dispatch(mergeStates());

            expect(caption()).toBe("Incoming: other branch feature · 2222222");
            expect(fakes.FakeDiffSideLabel.last).toBeUndefined();
        });

        it("counts the pane's markers as the host counts them, and the open conflicts in the walked list", async () => {
            await startMergePane();

            dispatch(mergeStates());

            expect(
                legendParent.querySelector(".diff-legend__slot--merge-taken-from-this-side")
                    ?.textContent,
            ).toBe("Taken from this side 1");
            expect(
                legendParent.querySelector(".diff-legend__slot--merge-conflict")?.textContent,
            ).toBe("Conflict 2");
            expect(counter()).toBe("–/3");
            expect(
                legendParent
                    .querySelector(".merge-bar__position")
                    ?.getAttribute("data-merge-tooltip"),
            ).toBe("3 open conflicts");
        });

        it("gives the left pane the caption and the counts only", async () => {
            await startMergePane();

            dispatch(leftStates());

            expect(caption()).toBe("Current: your branch main · 1111111");
            expect(legendParent.querySelector<HTMLElement>(".merge-bar__nav")?.hidden).toBe(true);
            expect(legendParent.querySelector<HTMLElement>(".merge-bar__actions")?.hidden).toBe(
                true,
            );
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
            expect(counter()).toBe("1/3");
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

        it("opens the menu at a shape-less step's row instead of moving the canvas, leaving the keyboard on ‹", async () => {
            await startMergePane();
            dispatch(mergeStates());
            legendButton("Prev change").focus();

            previous();

            expect(viewer().focusElement).not.toHaveBeenCalled();
            expect(menu().hidden).toBe(false);
            expect(rowStep("Process_1")?.getAttribute("aria-current")).toBe("true");
            expect(document.activeElement).toBe(legendButton("Prev change"));
            expect(cursorsPosted()).toEqual([4]);
        });

        it("closes the menu a step opened once the next step lands on a drawn element", async () => {
            await startMergePane();
            dispatch(mergeStates());
            previous();

            next();

            expect(menu().hidden).toBe(true);
            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
        });

        it("goes back to a shape-less step the host kept without opening the menu", async () => {
            await startMergePane();

            dispatch(mergeStates({ stepping: { list: "openConflicts", cursor: "Process_1" } }));

            expect(menu().hidden).toBe(true);
            expect(counter()).toBe("3/3");
        });

        it("opens no menu on the left pane for the partner's shape-less step", async () => {
            await startMergePane();
            dispatch(leftStates());

            dispatch(new SyncCursorQuery(4));

            expect(menu().hidden).toBe(true);
            expect(viewer().selectStep).toHaveBeenLastCalledWith(undefined, { keepInView: false });
        });

        it("steps to a shape-less element from its menu row", async () => {
            await startMergePane();
            dispatch(mergeStates());

            rowStep("Process_1")?.click();

            expect(cursorsPosted()).toEqual([4]);
            expect(counter()).toBe("3/3");
        });

        it("keeps the keyboard on a row it steps to", async () => {
            await startMergePane();
            dispatch(mergeStates());
            openMenu();
            rowStep("Process_1")?.focus();

            rowStep("Process_1")?.click();

            expect(document.activeElement).toBe(rowStep("Process_1"));
            expect(rowStep("Process_1")?.getAttribute("aria-current")).toBe("true");
        });

        it("keeps the keyboard on its row when the listed elements change", async () => {
            await startMergePane();
            dispatch(mergeStates());
            openMenu();
            rowStep("Process_1")?.focus();

            dispatch(
                mergeStates({
                    shapelessRows: [
                        ...STATES.shapelessRows,
                        {
                            id: "Message_1",
                            type: "bpmn:Message",
                            marker: "takenFromThisSide",
                            ...HELD_BY_BOTH,
                        },
                    ],
                }),
            );

            expect(document.activeElement).toBe(rowStep("Process_1"));
            expect(legendParent.querySelectorAll(".merge-menu__row")).toHaveLength(2);
        });

        it("switches to every merged element in the menu", async () => {
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
            expect(counter()).toBe("1/3");
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
        const selected = () => viewer().selectStep.mock.calls.map(([id]) => id);
        const keptInView = () =>
            viewer().selectStep.mock.calls.map(([id, { keepInView }]) => [id, keepInView]);
        const selectionsPosted = () =>
            posted()
                .filter((message) => message.type === "DiffSelectionChangedCommand")
                .map((message) => (message as { elementId: string }).elementId);

        it("selects the element a step lands on, after entering its plane, so its pad opens there", async () => {
            await startMergePane();
            dispatch(mergeStates());

            next();

            expect(selected()).toEqual(["Task_Pack"]);
            expect(viewer().focusElement.mock.invocationCallOrder[0]).toBeLessThan(
                viewer().selectStep.mock.invocationCallOrder[0],
            );
        });

        it("keeps the stepped element in view on the pane that stepped", async () => {
            await startMergePane();
            dispatch(mergeStates());

            next();

            expect(keptInView()).toEqual([["Task_Pack", true]]);
        });

        it("leaves keeping the partner's step in view to the partner, unless only this pane has it", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    allSteps: [
                        step("Task_Check", false, true, undefined, false),
                        ...STATES.allSteps.slice(1),
                    ],
                }),
            );

            dispatch(new SyncCursorQuery(2));
            dispatch(new SyncCursorQuery(0));

            expect(keptInView()).toEqual([
                ["Task_Pack", false],
                ["Task_Check", true],
            ]);
        });

        it("reports the stepped element after the cursor, so an open XML diff follows the step", async () => {
            await startMergePane();
            dispatch(mergeStates());
            host.postMessage.mockClear();

            next();

            expect(posted().map(({ type }) => type)).toEqual([
                "CursorChangedCommand",
                "DiffSelectionChangedCommand",
            ]);
            expect(selectionsPosted()).toEqual(["Task_Pack"]);
        });

        it("reports a step only the partner draws too, which then selects it there", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();

            next();

            expect(selectionsPosted()).toEqual(["Task_Pack", "Task_Gone"]);
        });

        it("reports no step without a shape, whose partner would select its process's root", async () => {
            await startMergePane();
            dispatch(mergeStates());

            previous();

            expect(cursorsPosted()).toEqual([4]);
            expect(selectionsPosted()).toEqual([]);
        });

        it("reports a clicked element of the merge once, as the user's selection, and keeps that selection", async () => {
            await startMergePane();
            dispatch(mergeStates());

            viewer().userSelects("Task_Check");

            expect(selectionsPosted()).toEqual(["Task_Check"]);
            expect(viewer().selectStep).not.toHaveBeenCalled();
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
                    .slice(-3),
            ).toEqual([
                "CursorChangedCommand",
                "DiffSelectionChangedCommand",
                "ViewportChangedCommand",
            ]);
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
            expect(caption()).not.toContain("Not in this version");
        });

        it("stops the viewport sync on a step whose plane this version lacks", async () => {
            await startMergePane();
            dispatch(mergeStates({ allSteps: SUB_STEPS }));
            viewer().showPlane.mockReturnValueOnce(false);

            dispatch(new SyncCursorQuery(5));
            viewer().viewportListener?.({ x: 0, y: 0, width: 10, height: 10 });

            expect(caption()).toBe(
                "Incoming: other branch feature · 2222222 · Not in this version",
            );
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

        const picksOf = () =>
            picksPosted().map((message) => ({
                type: message.type,
                elementId: (message as { elementId: string }).elementId,
                scope: (message as { scope: string }).scope,
                side: (message as { side?: string }).side,
            }));

        it("opens a shape-less element's XML changes from its row only where the host shows them", async () => {
            await startMergePane();
            dispatch(mergeStates());
            expect(rowOf("Process_1")?.querySelector(".merge-menu__xml")).toBeNull();

            dispatch(mergeStates({}, true));
            rowOf("Process_1")?.querySelector<HTMLButtonElement>(".merge-menu__xml")?.click();

            expect(
                posted()
                    .filter((message) => message.type === "ShowElementXmlChangesCommand")
                    .map((message) => (message as { elementId: string }).elementId),
            ).toStrictEqual(["Process_1"]);
        });

        it("keeps a shape-less element from either side through its menu row, naming the side", async () => {
            await startMergePane();
            dispatch(mergeStates());

            rowButton("Process_1", "Keep current").click();
            rowButton("Process_1", "Keep incoming").click();

            expect(picksOf()).toEqual([
                {
                    type: "PickMergeSideCommand",
                    elementId: "Process_1",
                    scope: "element",
                    side: "current",
                },
                {
                    type: "PickMergeSideCommand",
                    elementId: "Process_1",
                    scope: "element",
                    side: "incoming",
                },
            ]);
        });

        it("keeps a shape-less entry with everything inside, and undoes its pick", async () => {
            await startMergePane();
            const processRow = {
                id: "Process_1",
                type: "bpmn:Process",
                container: "contents" as const,
                ...HELD_BY_BOTH,
            };
            dispatch(mergeStates({ shapelessRows: [{ ...processRow, marker: "conflict" }] }));

            expect(rowButtons("Process_1")).toEqual([
                "Keep current",
                "Keep current with everything inside",
                "Keep incoming",
                "Keep incoming with everything inside",
            ]);
            openMenu();
            const keepInside = rowButton("Process_1", "Keep incoming with everything inside");
            keepInside.focus();
            keepInside.click();
            dispatch(
                mergeStates({
                    shapelessRows: [
                        {
                            ...processRow,
                            marker: "takenFromThisSide",
                            takenSide: "incoming",
                            pick: { keptSide: "incoming", scope: "withContents" },
                        },
                    ],
                }),
            );

            expect(rowButtons("Process_1")).toEqual([
                "Keep current",
                "Keep current with everything inside",
                "Keep incoming with everything inside",
                "Undo pick",
            ]);
            const pressed = rowButton("Process_1", "Keep incoming with everything inside");
            expect(pressed.getAttribute("aria-pressed")).toBe("true");
            expect(document.activeElement).toBe(pressed);
            rowButton("Process_1", "Undo pick").click();

            expect(picksOf()).toEqual([
                {
                    type: "PickMergeSideCommand",
                    elementId: "Process_1",
                    scope: "withContents",
                    side: "incoming",
                },
                {
                    type: "UnpickMergeCommand",
                    elementId: "Process_1",
                    scope: "withContents",
                    side: undefined,
                },
            ]);
        });

        it("decides in the menu a conflict on a shape-less element only current holds", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    shapelessRows: [
                        ...STATES.shapelessRows,
                        {
                            id: "Message_1",
                            type: "bpmn:Message",
                            marker: "conflict",
                            lackingSide: { side: "incoming", lack: "removed" },
                            current: { name: "Order received" },
                            differences: [],
                        },
                    ],
                }),
            );

            expect(rowStep("Message_1")?.textContent).toBe("Order received (Message)");
            expect(rowButtons("Message_1")).toEqual(["Keep current", "Leave out"]);
            rowButton("Message_1", "Leave out").click();

            expect(picksOf()).toEqual([
                {
                    type: "PickMergeSideCommand",
                    elementId: "Message_1",
                    scope: "element",
                    side: "incoming",
                },
            ]);
        });

        it("counts the open shape-less conflicts on the menu's button", async () => {
            await startMergePane();
            dispatch(mergeStates());

            expect(legendParent.querySelector(".merge-bar__badge")?.textContent).toBe("1");
        });

        it("says in the row what its decision did, announced once, and shows no card", async () => {
            await startMergePane();
            dispatch(mergeStates());
            rowButton("Process_1", "Keep incoming").click();

            dispatch(
                mergeStates({
                    shapelessRows: [
                        {
                            id: "Process_1",
                            type: "bpmn:Process",
                            marker: "takenFromThisSide",
                            ...HELD_BY_BOTH,
                            takenSide: "incoming",
                            pick: { keptSide: "incoming", scope: "element" },
                        },
                    ],
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

            expect(rowOf("Process_1")?.querySelector(".merge-menu__outcome")?.textContent).toBe(
                "Kept from incoming: Process_1",
            );
            expect(menu().querySelector('[role="status"]')?.textContent).toBe(
                "Kept from incoming: Process_1",
            );
            expect(card().show).not.toHaveBeenCalled();
        });

        it("says nothing in the row for the partner's decision", async () => {
            await startMergePane();
            dispatch(mergeStates());

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

            expect(
                rowOf("Process_1")?.querySelector<HTMLElement>(".merge-menu__outcome")?.hidden,
            ).toBe(true);
        });

        it("stays on a stepped shape-less element and moves the focus to its row's next decision when a pick hides the pressed one", async () => {
            await startMergePane();
            dispatch(mergeStates());
            previous();
            const keep = rowButton("Process_1", "Keep incoming");
            keep.focus();
            keep.click();

            dispatch(
                mergeStates({
                    openConflictSteps: [step("Task_Pack"), step("Task_Gone", false, false)],
                    shapelessRows: [
                        {
                            id: "Process_1",
                            type: "bpmn:Process",
                            marker: "takenFromThisSide",
                            ...HELD_BY_BOTH,
                            takenSide: "incoming",
                            pick: { keptSide: "incoming", scope: "element" },
                        },
                    ],
                }),
            );

            expect(document.activeElement?.textContent).toBe("Keep current");
            expect(rowOf("Process_1")?.contains(document.activeElement)).toBe(true);
            expect(counter()).toBe("3/3");
            previous();
            expect(cursorsPosted().at(-1)).toBe(3);
            expect(counter()).toBe("2/2");
        });

        it("offers in the row to keep the flows removed with a shape-less element", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    restoreOffer: {
                        elementId: "Process_1",
                        connections: ["Flow_2", "Flow_3"],
                        removedBy: "current",
                    },
                }),
            );

            rowButton("Process_1", "Also keep what was removed with it").click();

            expect(picksOf()).toEqual([
                {
                    type: "PickMergeSideCommand",
                    elementId: "Process_1",
                    scope: "withRemoved",
                    side: "incoming",
                },
            ]);
        });

        it("offers in the right pane's row to keep the flows incoming removed with a shape-less element kept from current", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    shapelessRows: [
                        {
                            id: "Message_1",
                            type: "bpmn:Message",
                            marker: "takenFromOtherSide",
                            takenSide: "current",
                            lackingSide: { side: "incoming", lack: "removed" },
                            pick: { keptSide: "current", scope: "element" },
                            current: {},
                            differences: [],
                        },
                    ],
                    restoreOffer: {
                        elementId: "Message_1",
                        connections: ["Flow_9"],
                        removedBy: "incoming",
                    },
                }),
            );

            rowButton("Message_1", "Also keep what was removed with it").click();

            expect(picksOf()).toEqual([
                {
                    type: "PickMergeSideCommand",
                    elementId: "Message_1",
                    scope: "withRemoved",
                    side: "current",
                },
            ]);
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
                            undo: "element",
                            otherSideLacks: "removed",
                        },
                    ],
                    badges: [
                        {
                            id: "Task_Pack",
                            kind: "replacedHere",
                            keptSide: "current",
                            scope: "element",
                        },
                    ],
                    restoreOffer: {
                        elementId: "Task_Pack",
                        connections: ["Flow_1"],
                        removedBy: "current",
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
                { type: "PickMergeSideCommand", scope: "element", side: "incoming" },
                { type: "PickMergeSideCommand", scope: "element", side: "current" },
                { type: "PickMergeSideCommand", scope: "withRemoved", side: "incoming" },
                { type: "UnpickMergeCommand", scope: "element", side: undefined },
            ]);
        });

        it("refreshes an open pick pad with every state, so its entries follow the host", async () => {
            await startMergePane();
            fakes.pickPad.provider.refresh.mockClear();

            dispatch(mergeStates());

            expect(fakes.pickPad.provider.refresh).toHaveBeenCalledOnce();
        });
    });

    describe("the outcome card", () => {
        const keepPack = {
            applied: true,
            action: "pick",
            elementId: "Task_Pack",
            pulledIn: ["Flow_1"],
            dropped: [],
            reopened: [],
        } as const;
        const pad = () => fakes.pickPad.config!;
        const shown = () =>
            card().show.mock.calls.map(([content, , options]) => ({
                elementId: content.elementId,
                headline: content.headline,
                announce: options.announce,
            }));

        /** Keeps Task_Pack from this pane's side on its pad, and lets the host answer with `outcome`. */
        async function keepPackOnPad(outcome: MergePaneStates["lastOutcome"] = keepPack) {
            await startMergePane();
            dispatch(mergeStates());
            next();
            pad().decide("Task_Pack", { kind: "keep", scope: "element", side: "current" });
            dispatch(mergeStates({ lastOutcome: outcome }));
        }

        it("shows what a pad decision did below its element, naming the side it kept, announced once", async () => {
            await keepPackOnPad();

            expect(shown()).toEqual([
                {
                    elementId: "Task_Pack",
                    headline: "Kept from current: Pack parcel",
                    announce: true,
                },
            ]);
        });

        it("shows no card on the pane that did not send the decision, and no outcome in its bar", async () => {
            await startMergePane();
            dispatch(mergeStates());
            const legendBefore = legendText();

            dispatch(mergeStates({ lastOutcome: keepPack }));

            expect(card().show).not.toHaveBeenCalled();
            expect(legendText()).toBe(legendBefore);
        });

        it("says in the card, not the bar, why a decision was refused", async () => {
            await keepPackOnPad({
                applied: false,
                action: "pick",
                elementId: "Task_Pack",
                blockedBy: [
                    { elementId: "Task_Check", targetId: "Task_Pack", obstacle: "dependentPicked" },
                ],
            });

            const [content] = card().show.mock.lastCall!;
            expect(content.headline).toBe("Can't keep Pack parcel");
            expect(content.reasons).toEqual(["Your pick of Task_Check needs it"]);
            expect(content.blockers).toEqual(["Task_Check"]);
            expect(legendText()).not.toContain("Pack parcel");
        });

        it("marks the blockers again after every repaint while it shows", async () => {
            await keepPackOnPad();
            card().remark.mockClear();
            card().close.mockClear();

            dispatch(mergeStates({ lastOutcome: keepPack }));

            expect(card().remark).toHaveBeenCalledOnce();
            expect(card().close).not.toHaveBeenCalled();
        });

        it("closes on the next step and shows again, unannounced, when its element is stepped to again", async () => {
            await keepPackOnPad();

            next();
            expect(card().close).toHaveBeenCalled();
            expect(card().shownAt).toBeUndefined();

            previous();
            expect(shown().at(-1)).toEqual({
                elementId: "Task_Pack",
                headline: "Kept from current: Pack parcel",
                announce: false,
            });
        });

        it("closes on the selection of another element or none, and shows again when its element is clicked again", async () => {
            await keepPackOnPad();

            viewer().userSelects(undefined);
            expect(card().shownAt).toBeUndefined();

            viewer().userSelects("Task_Pack");
            expect(card().shownAt).toBe("Task_Pack");
            expect(shown().at(-1)?.announce).toBe(false);

            viewer().userSelects("Task_Check");
            expect(card().shownAt).toBeUndefined();
        });

        it("closes on the partner's newer outcome and does not show this pane's again", async () => {
            await keepPackOnPad();

            dispatch(mergeStates({ lastOutcome: { ...keepPack, elementId: "Task_Check" } }));
            viewer().userSelects("Task_Check");
            viewer().userSelects("Task_Pack");

            expect(card().close).toHaveBeenCalled();
            expect(card().show).toHaveBeenCalledOnce();
        });

        it("stays open when a link on it steps to another element", async () => {
            await keepPackOnPad();
            card().close.mockClear();

            card().lastActions!.onSelect("Task_Check");

            expect(cursorsPosted().at(-1)).toBe(0);
            expect(card().close).not.toHaveBeenCalled();
        });

        it("offers the flows the other side removed while the host offers them, and keeps them with the element", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();
            pad().decide("Task_Pack", { kind: "keep", scope: "element", side: "current" });
            dispatch(
                mergeStates({
                    lastOutcome: keepPack,
                    restoreOffer: {
                        elementId: "Task_Pack",
                        connections: ["Flow_2", "Flow_3"],
                        removedBy: "current",
                    },
                }),
            );

            const [content, actions] = card().show.mock.lastCall!;
            expect(content.offer?.text).toBe("Also keep the 2 flows current removed with it");
            expect(legendText()).not.toContain("Also keep");
            host.postMessage.mockClear();
            actions.onKeepRemovedWith("Task_Pack");

            expect(posted()).toEqual([
                expect.objectContaining({
                    type: "PickMergeSideCommand",
                    elementId: "Task_Pack",
                    scope: "withRemoved",
                    side: "incoming",
                }),
            ]);
        });

        it("shows no card for a row decision on a shape-less step whose root the canvas holds, and closes the one it showed", async () => {
            await keepPackOnPad();
            // bpmn-js registers a plane's root under its process's id.
            viewer().drawn.add("Process_1");
            previous();
            rowButton("Process_1", "Keep current").click();
            card().close.mockClear();

            dispatch(
                mergeStates({
                    lastOutcome: { ...keepPack, elementId: "Process_1", pulledIn: [] },
                }),
            );

            expect(card().show).toHaveBeenCalledOnce();
            expect(card().close).toHaveBeenCalled();
            expect(rowOf("Process_1")?.textContent).toContain("Kept from current: Process_1");
        });

        it("names the side that lacks what a leave-out left out", async () => {
            await startMergePane();
            dispatch(mergeStates());
            next();
            pad().decide("Task_Pack", {
                kind: "leaveOut",
                side: "incoming",
                otherSideLacks: "missing",
            });

            dispatch(
                mergeStates({ lastOutcome: { ...keepPack, action: "leaveOut", pulledIn: [] } }),
            );

            expect(shown().at(-1)?.headline).toBe(
                "Left out: Pack parcel, as incoming doesn't have it",
            );
        });
    });

    describe("merging an element's XML by hand", () => {
        const pad = () => fakes.pickPad.config!;
        const opensPosted = () =>
            posted()
                .filter((message) => message.type === "OpenElementXmlMergeCommand")
                .map((message) => ({ ...message }));
        const picksPosted = () =>
            posted()
                .filter(
                    (message) =>
                        message.type === "PickMergeSideCommand" ||
                        message.type === "UnpickMergeCommand",
                )
                .map((message) => ({ ...message }));
        const keptPack = {
            id: "Task_Pack",
            kind: "keptHere",
            keptSide: "incoming",
            scope: "element",
        } as const;
        const HAND_MERGEABLE: Partial<MergePaneStates> = {
            pickable: [{ id: "Task_Pack", undo: "element", handMergeable: true }],
            badges: [keptPack],
        };
        const offered = (states: Partial<MergePaneStates> = {}) =>
            mergeStates({ ...HAND_MERGEABLE, ...states }, false, true);
        const refusal = {
            applied: false,
            action: "mergeByHand",
            elementId: "Task_Pack",
            blockedBy: [],
            handMergeRefusal: { kind: "conflictMarkersLeft" },
        } as const;

        it("offers Merge XML on the pad only where the host has the merge editor, and opens it without a pick", async () => {
            await startMergePane();
            dispatch(mergeStates(HAND_MERGEABLE));
            expect(pad().decisionsOf("Task_Pack")).toEqual([{ kind: "undo", scope: "element" }]);

            dispatch(offered());
            const mergeXml = pad()
                .decisionsOf("Task_Pack")
                .find((decision) => (decision as MergePadDecision).kind === "mergeXml");
            pad().decide("Task_Pack", mergeXml);

            expect(mergeXml).toEqual({ kind: "mergeXml", mode: "open" });
            expect(opensPosted()).toEqual([
                expect.objectContaining({
                    type: "OpenElementXmlMergeCommand",
                    elementId: "Task_Pack",
                }),
            ]);
            expect(opensPosted()[0]).not.toHaveProperty("resume");
            expect(picksPosted()).toEqual([]);
        });

        it("offers editing the merged XML once the element is merged by hand", async () => {
            await startMergePane();

            dispatch(offered({ badges: [{ ...keptPack, mergedByHand: true }] }));

            expect(pad().decisionsOf("Task_Pack")).toContainEqual({
                kind: "mergeXml",
                mode: "edit",
            });
        });

        it("names a badge merged by hand with its word", async () => {
            await startMergePane();
            const merged = { ...keptPack, mergedByHand: true } as const;

            dispatch(offered({ badges: [merged] }));

            const [, labels] = fakes.marks.paint.mock.lastCall!;
            expect(labels.badge(merged)).toEqual({
                side: "Incoming",
                label: "Kept from incoming and merged by hand, your pick",
                byHand: "by hand",
            });
        });

        it("shows the finished merge on the card of the pane that asked, and Edit again reopens the refused text", async () => {
            await startMergePane();
            dispatch(offered());
            next();
            pad().decide("Task_Pack", { kind: "mergeXml", mode: "open" });

            dispatch(offered({ lastOutcome: refusal }));
            const [content] = card().show.mock.lastCall!;
            card().lastActions!.onChoose("editAgain");

            expect(content.headline).toBe("The XML of Pack parcel still holds conflict markers");
            expect(content.choices).toEqual([
                { action: "editAgain", text: "Edit again", primary: true },
                { action: "dismiss", text: "Keep incoming's version" },
            ]);
            expect(opensPosted().at(-1)).toMatchObject({ elementId: "Task_Pack", resume: true });
        });

        it("closes the card on Keep the version, and does not show it again", async () => {
            await startMergePane();
            dispatch(offered());
            next();
            pad().decide("Task_Pack", { kind: "mergeXml", mode: "open" });
            dispatch(offered({ lastOutcome: refusal }));

            card().lastActions!.onChoose("dismiss");
            viewer().userSelects(undefined);
            viewer().userSelects("Task_Pack");

            expect(card().close).toHaveBeenCalled();
            expect(card().show).toHaveBeenCalledOnce();
        });

        it("asks before a pick drops the XML merged by hand, and Drop it resends the pick with consent", async () => {
            await startMergePane();
            dispatch(offered({ badges: [{ ...keptPack, mergedByHand: true }] }));
            next();
            pad().decide("Task_Pack", { kind: "keep", scope: "element", side: "current" });

            dispatch(
                offered({
                    badges: [{ ...keptPack, mergedByHand: true }],
                    lastOutcome: {
                        applied: false,
                        action: "pick",
                        elementId: "Task_Pack",
                        blockedBy: [],
                        handMergesAtStake: ["Task_Pack"],
                    },
                }),
            );
            const [content] = card().show.mock.lastCall!;
            card().lastActions!.onChoose("dropHandMerges");

            expect(content.headline).toBe("This drops the XML you merged by hand for Pack parcel");
            expect(picksPosted()).toEqual([
                expect.objectContaining({ elementId: "Task_Pack", side: "current" }),
                expect.objectContaining({
                    elementId: "Task_Pack",
                    side: "current",
                    dropsHandMerges: true,
                }),
            ]);
            expect(picksPosted()[0]).not.toHaveProperty("dropsHandMerges");
        });

        it("merges a shape-less element's XML from its menu row and answers in the row", async () => {
            await startMergePane();
            const picked = {
                ...STATES.shapelessRows[0],
                marker: "takenFromThisSide",
                takenSide: "incoming",
                pick: { keptSide: "incoming", scope: "element" },
                handMergeable: true,
            } as const;
            dispatch(mergeStates({ shapelessRows: [picked] }, false, true));
            openMenu();

            rowButton("Process_1", "Merge XML").click();
            dispatch(
                mergeStates(
                    {
                        shapelessRows: [picked],
                        lastOutcome: { ...refusal, elementId: "Process_1" },
                    },
                    false,
                    true,
                ),
            );
            rowButton("Process_1", "Edit again").click();

            expect(opensPosted()).toEqual([
                expect.objectContaining({ elementId: "Process_1" }),
                expect.objectContaining({ elementId: "Process_1", resume: true }),
            ]);
            expect(
                rowOf("Process_1")?.querySelector(".merge-menu__outcome")?.textContent,
            ).toContain("still holds conflict markers");
            expect(card().show).not.toHaveBeenCalled();
        });
    });

    describe("keyboard commands", () => {
        const commandsPosted = () =>
            posted()
                .filter((message) => message.type === "MergePaneCommandsChangedCommand")
                .map(
                    (message) => (message as { available: readonly MergePaneCommand[] }).available,
                );
        const decisionsPosted = () =>
            posted()
                .filter(
                    (message) =>
                        message.type === "PickMergeSideCommand" ||
                        message.type === "UnpickMergeCommand",
                )
                .map((message) => ({ ...message }));
        const typesPosted = () => posted().map((message) => message.type);
        /** diagram-js reports every selection, the user's, a step's and the partner's. */
        const selectOnCanvas = (id: string | undefined) => {
            fakes.pickPad.provider.selected = id;
            fakes.pickPad.config!.selectionChanged();
        };
        const run = (command: MergePaneCommand) => dispatch(new RunMergePaneCommandQuery(command));
        // A container this pane kept nothing of yet, which current removed, with the flows it removed.
        const EVERY_ENTRY: Partial<MergePaneStates> = {
            pickable: [
                {
                    id: "Task_Pack",
                    container: "contents",
                    undo: "element",
                    otherSideLacks: "removed",
                },
            ],
            badges: [
                { id: "Task_Pack", kind: "replacedHere", keptSide: "current", scope: "element" },
            ],
            restoreOffer: { elementId: "Task_Pack", connections: ["Flow_1"], removedBy: "current" },
        };

        it("tells the host what its selection allows with every state and selection, once per change", async () => {
            await startMergePane();
            dispatch(mergeStates());

            selectOnCanvas("Task_Pack");
            selectOnCanvas("Task_Pack");
            dispatch(
                mergeStates({
                    pickable: [{ id: "Task_Pack", undo: "element" }],
                    badges: [
                        {
                            id: "Task_Pack",
                            kind: "keptHere",
                            keptSide: "incoming",
                            scope: "element",
                        },
                    ],
                }),
            );
            selectOnCanvas(undefined);

            expect(commandsPosted()).toEqual([
                ["next", "previous", "build"],
                ["keep", "next", "previous", "build"],
                ["undo", "next", "previous", "build"],
                ["next", "previous", "build"],
            ]);
        });

        it.each<[MergePadEntry, Record<string, unknown>]>([
            ["keep", { type: "PickMergeSideCommand", scope: "element", side: "incoming" }],
            [
                "keepInside",
                { type: "PickMergeSideCommand", scope: "withContents", side: "incoming" },
            ],
            ["leaveOut", { type: "PickMergeSideCommand", scope: "element", side: "current" }],
            [
                "keepRemovedWith",
                { type: "PickMergeSideCommand", scope: "withRemoved", side: "incoming" },
            ],
            ["undo", { type: "UnpickMergeCommand", scope: "element" }],
        ])(
            "runs %s on the selected element as the pad's entry does, side included",
            async (entry, sent) => {
                await startMergePane();
                dispatch(mergeStates(EVERY_ENTRY));
                selectOnCanvas("Task_Pack");
                const pad = fakes.pickPad.config!;
                const padDecision = pad
                    .decisionsOf("Task_Pack")
                    .find((decision) => padEntryOf(decision as MergePadDecision) === entry);
                expect(padDecision).toBeDefined();

                run(entry);
                pad.decide("Task_Pack", padDecision);

                const [byKeyboard, byPad] = decisionsPosted();
                expect(byKeyboard).toMatchObject({ elementId: "Task_Pack", ...sent });
                expect(byKeyboard).toEqual(byPad);
            },
        );

        it("opens the selected element's XML merge with mergeXml, as the pad's entry does", async () => {
            await startMergePane();
            dispatch(
                mergeStates(
                    {
                        pickable: [{ id: "Task_Pack", undo: "element", handMergeable: true }],
                        badges: [
                            {
                                id: "Task_Pack",
                                kind: "keptHere",
                                keptSide: "incoming",
                                scope: "element",
                            },
                        ],
                    },
                    false,
                    true,
                ),
            );
            selectOnCanvas("Task_Pack");

            run("mergeXml");

            expect(commandsPosted().at(-1)).toEqual([
                "mergeXml",
                "undo",
                "next",
                "previous",
                "build",
            ]);
            expect(
                posted().filter((message) => message.type === "OpenElementXmlMergeCommand"),
            ).toEqual([expect.objectContaining({ elementId: "Task_Pack" })]);
            expect(decisionsPosted()).toEqual([]);
        });

        it("picks nothing with nothing selected or where the pad does not offer the decision", async () => {
            await startMergePane();
            dispatch(mergeStates());

            for (const entry of MERGE_PAD_ENTRIES) run(entry);
            selectOnCanvas("Task_Pack");
            for (const entry of MERGE_PAD_ENTRIES.filter((candidate) => candidate !== "keep"))
                run(entry);
            selectOnCanvas("Task_Unmarked");
            run("keep");

            expect(decisionsPosted()).toEqual([]);
        });

        it("steps with next and previous as ‹ › do, on either pane", async () => {
            await startMergePane();
            dispatch(mergeStates());

            run("next");
            run("next");
            run("previous");

            expect(cursorsPosted()).toEqual([2, 3, 2]);
            expect(counter()).toBe("1/3");
        });

        it("steps on the left pane too, which has no ‹ ›", async () => {
            await startMergePane();
            dispatch(leftStates());

            run("next");

            expect(cursorsPosted()).toEqual([2]);
        });

        it("posts Build even while conflicts are open, so the host's refusal answers it", async () => {
            await startMergePane();
            dispatch(mergeStates());

            run("build");

            expect(typesPosted()).toContain("BuildMergeResultCommand");
        });

        it("moves no focus, onto a shape-less step's menu row neither", async () => {
            await startMergePane();
            dispatch(mergeStates(EVERY_ENTRY));
            const outside = document.createElement("button");
            document.body.append(outside);
            outside.focus();

            for (const command of ["next", "next", "next"] as const) run(command);
            selectOnCanvas("Task_Pack");
            run("keep");
            run("build");

            expect(menu().hidden).toBe(false);
            expect(document.activeElement).toBe(outside);
            outside.remove();
        });
    });

    describe("build", () => {
        const afterStates = (build: Partial<MergePaneStates["build"]>) =>
            mergeStates({ build: { ...STATES.build, ...build } });
        const typesPosted = () => posted().map((message) => message.type);
        const shown = (element: Element | null) =>
            element !== null && element.closest("[hidden]") === null;
        const notes = () => legendParent.querySelector<HTMLElement>(".merge-notes")!;

        it("offers Build on the right pane only, disabled while conflicts are left, and says why", async () => {
            await startMergePane();
            dispatch(leftStates());
            expect(shown(legendButton("Build"))).toBe(false);

            dispatch(afterStates({}));

            const build = legendButton("Build");
            expect(shown(build)).toBe(true);
            expect(build.disabled).toBe(true);
            expect(
                document.getElementById(build.getAttribute("aria-describedby")!)?.textContent,
            ).toBe("3 conflicts left");
            build.click();
            expect(typesPosted()).not.toContain("BuildMergeResultCommand");
        });

        it("builds once no conflict is open", async () => {
            await startMergePane();
            dispatch(afterStates({ canBuild: true, openConflicts: 0 }));

            legendButton("Build").click();

            expect(legendButton("Build").hasAttribute("aria-describedby")).toBe(false);
            expect(typesPosted()).toContain("BuildMergeResultCommand");
        });

        it("compares the result with either side from the menu once one is built", async () => {
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

        it("lists the notes of the build in their popover, named as the host or the canvas names them, and selects what a note names", async () => {
            await startMergePane();
            dispatch(
                mergeStates({
                    names: { Task_Gone: "Reject order" },
                    build: {
                        canBuild: true,
                        openConflicts: 0,
                        built: true,
                        notes: [
                            {
                                kind: "restoredWithoutRemovedWith",
                                id: "Task_Pack",
                                connections: ["Task_Gone", "Flow_1"],
                                named: ["Task_Pack", "Task_Gone", "Flow_1"],
                            },
                        ],
                    },
                }),
            );
            const review = legendButton("Review notes (1)");
            expect(review.getAttribute("aria-expanded")).toBe("false");

            review.click();

            expect(shown(notes())).toBe(true);
            expect(notes().textContent).toContain(
                "Pack parcel is kept without the flows the other side removed with it: Reject order, Flow_1",
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
                            named: ["Task_Pack", "Task_Check"],
                        },
                    ],
                }),
            );

            legendButton("Review notes (1)").click();

            expect(notes().textContent).toContain(
                "Both sides changed the layout of Pack parcel, Task_Check; incoming's is kept",
            );
            legendButton("Pack parcel").click();
            expect(viewer().focusElement).toHaveBeenLastCalledWith("Task_Pack");
            legendButton("Task_Check").click();
            expect(cursorsPosted().at(-1)).toBe(0);
        });

        it("offers no notes before a build or after one with none", async () => {
            await startMergePane();
            dispatch(afterStates({ canBuild: true, openConflicts: 0, built: true }));

            expect(legendButton("Review notes (0)").disabled).toBe(true);
            expect(legendButton("Compare with incoming").disabled).toBe(false);
        });
    });
});
