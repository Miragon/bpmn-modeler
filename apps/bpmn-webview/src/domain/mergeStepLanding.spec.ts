import { describe, expect, it, vi } from "vitest";
import type { MergePaneStates, MergePaneStep } from "@miragon/bpmn-modeler-shared";

import {
    landOnStep,
    MERGE_STEP_LANDINGS,
    type MergeLandingPlan,
    type MergeLandingStep,
    type MergeStepLanding,
    stepClicked,
    stepNamed,
    stepTakenBack,
} from "./mergeStepLanding";

const BOTH: MergeLandingStep = { shapeless: false, onThisPane: true, onOtherPane: true };
const ONLY_HERE: MergeLandingStep = { ...BOTH, onOtherPane: false };
const ONLY_PARTNER: MergeLandingStep = { ...BOTH, onThisPane: false };
const SHAPELESS: MergeLandingStep = { ...BOTH, shapeless: true };
const IN_SUB_PROCESS: MergeLandingStep = { ...BOTH, plane: "Sub_Ship" };
const PARTNERS_IN_SUB_PROCESS: MergeLandingStep = { ...ONLY_PARTNER, plane: "Sub_Ship" };

type Step = MergeLandingStep;

const centring = (centred: boolean) => () => centred;
/** What the canvas does when a step it draws asks it to centre: it finds the element. */
const canvasCentres = () => true;

const PACK: MergePaneStep = { id: "Task_Pack", ...BOTH };
const CHECK: MergePaneStep = { id: "Task_Check", ...BOTH };
const STEPS: Pick<MergePaneStates, "allSteps" | "pickable" | "stepping"> = {
    allSteps: [CHECK, PACK],
    pickable: [{ id: "Task_Check" }, { id: "Task_Pack" }, { id: "Task_Other" }],
    stepping: { list: "openConflicts" },
};

describe("stepNamed", () => {
    it("is the step an id names", () => {
        expect(stepNamed(STEPS, "Task_Pack")).toBe(PACK);
    });

    it.each<[string, string | undefined]>([
        ["an element that is no step", "Task_Other"],
        ["no element", undefined],
    ])("is none for %s", (_case, id) => {
        expect(stepNamed(STEPS, id)).toBeUndefined();
    });
});

describe("stepClicked", () => {
    it("is the step a click on an element the user can pick names", () => {
        expect(stepClicked(STEPS, "Task_Pack", "Task_Check")).toBe(PACK);
    });

    it.each<[string, string | undefined, Partial<typeof STEPS>]>([
        ["an element that is no step", "Task_Other", {}],
        ["nothing", undefined, {}],
        ["a step the user cannot pick", "Task_Pack", { pickable: [{ id: "Task_Check" }] }],
        ["the step the cursor is on", "Task_Check", {}],
    ])("is none for a click on %s", (_case, clicked, states) => {
        expect(stepClicked({ ...STEPS, ...states }, clicked, "Task_Check")).toBeUndefined();
    });
});

describe("stepTakenBack", () => {
    const kept = (cursor: string) => ({ ...STEPS, stepping: { list: "all" as const, cursor } });

    it("is the step the host kept while the pane has none of its own, as after a reload", () => {
        expect(stepTakenBack(kept("Task_Pack"), undefined)).toBe(PACK);
    });

    it.each<[string, typeof STEPS, string | undefined]>([
        ["the pane has a step of its own", kept("Task_Pack"), "Task_Check"],
        ["the host kept none", STEPS, undefined],
        ["the steps no longer list the kept one", kept("Task_Other"), undefined],
    ])("is none when %s", (_case, states, cursorId) => {
        expect(stepTakenBack(states, cursorId)).toBeUndefined();
    });
});

describe("landOnStep", () => {
    describe("centring", () => {
        it.each<[string, Step, boolean]>([
            ["a step both panes draw", BOTH, true],
            ["a step only this pane draws", ONLY_HERE, true],
            ["not a step only the partner draws", ONLY_PARTNER, false],
            ["not a step without a shape", SHAPELESS, false],
        ])("asks the canvas to centre %s", (_case, step, asks) => {
            const tryCentre = vi.fn(canvasCentres);

            landOnStep(step, "stepped", tryCentre);

            expect(tryCentre).toHaveBeenCalledTimes(asks ? 1 : 0);
        });

        it("counts a step it does not centre as not centred, whatever the canvas would find", () => {
            expect(landOnStep(ONLY_PARTNER, "stepped", canvasCentres)).toEqual(
                landOnStep(ONLY_PARTNER, "stepped", centring(false)),
            );
        });
    });

    describe("the canvas", () => {
        it.each<[string, Step, boolean, MergeLandingPlan["canvas"]]>([
            [
                "notes the plane of the element it centred",
                IN_SUB_PROCESS,
                true,
                { kind: "centred", plane: "Sub_Ship" },
            ],
            [
                "notes the opening plane for an element centred there",
                BOTH,
                true,
                { kind: "centred", plane: undefined },
            ],
            [
                "follows the plane of an element this version holds but could not centre",
                IN_SUB_PROCESS,
                false,
                { kind: "followsPlane", plane: "Sub_Ship" },
            ],
            [
                "follows the partner into the plane of a step only it draws",
                PARTNERS_IN_SUB_PROCESS,
                false,
                { kind: "followsPlane", plane: "Sub_Ship" },
            ],
            [
                "follows the partner back to the opening plane",
                ONLY_PARTNER,
                false,
                { kind: "followsPlane", plane: undefined },
            ],
            [
                "stays in place for a step without a shape",
                SHAPELESS,
                false,
                { kind: "staysInPlace" },
            ],
        ])("%s", (_case, step, centred, expected) => {
            for (const landing of MERGE_STEP_LANDINGS) {
                expect(landOnStep(step, landing, centring(centred)).canvas).toEqual(expected);
            }
        });
    });

    describe("the selection", () => {
        it.each<[string, MergeStepLanding, Step, boolean, MergeLandingPlan["selection"]]>([
            [
                "a user's step selects what it centred and keeps it in view",
                "stepped",
                BOTH,
                true,
                { kind: "select", keepsInView: true },
            ],
            [
                "a card link's step selects what it centred and keeps it in view",
                "steppedFromCard",
                BOTH,
                true,
                { kind: "select", keepsInView: true },
            ],
            [
                "the partner's step selects here too, leaving keeping it in view to the partner",
                "followed",
                BOTH,
                true,
                { kind: "select", keepsInView: false },
            ],
            [
                "the partner's step keeps in view what only this pane draws",
                "followed",
                ONLY_HERE,
                true,
                { kind: "select", keepsInView: true },
            ],
            [
                "a reload selects the kept step, leaving keeping it in view to the partner",
                "reloaded",
                BOTH,
                true,
                { kind: "select", keepsInView: false },
            ],
            [
                "a reload keeps in view what only this pane draws",
                "reloaded",
                ONLY_HERE,
                true,
                { kind: "select", keepsInView: true },
            ],
            ["a click's own selection stands", "clicked", BOTH, true, { kind: "leave" }],
            [
                "a click's own selection stands where nothing was centred",
                "clicked",
                ONLY_PARTNER,
                false,
                { kind: "leave" },
            ],
            [
                "a user's step clears the selection where only the partner draws",
                "stepped",
                ONLY_PARTNER,
                false,
                { kind: "clear" },
            ],
            [
                "the partner's step onto an element without a shape clears the selection",
                "followed",
                SHAPELESS,
                false,
                { kind: "clear" },
            ],
            [
                "a step this pane could not centre clears the selection",
                "followed",
                IN_SUB_PROCESS,
                false,
                { kind: "clear" },
            ],
        ])("%s", (_case, landing, step, centred, expected) => {
            expect(landOnStep(step, landing, centring(centred)).selection).toEqual(expected);
        });
    });

    describe("the outcome card", () => {
        it.each<[string, MergeStepLanding, Step, boolean, MergeLandingPlan["card"]]>([
            ["follows a user's step to what it centred", "stepped", BOTH, true, "followStep"],
            ["follows the partner's step to what it centred", "followed", BOTH, true, "followStep"],
            ["follows a reload to what it centred", "reloaded", BOTH, true, "followStep"],
            ["follows a click to what it centred", "clicked", BOTH, true, "followStep"],
            [
                "follows no element on a step only the partner draws",
                "stepped",
                ONLY_PARTNER,
                false,
                "followNothing",
            ],
            [
                "follows no element on a step this pane could not centre",
                "followed",
                IN_SUB_PROCESS,
                false,
                "followNothing",
            ],
            ["stays as it is on its own link's step", "steppedFromCard", BOTH, true, "keep"],
            [
                "stays as it is on its own link's step to an element it cannot show",
                "steppedFromCard",
                ONLY_PARTNER,
                false,
                "keep",
            ],
        ])("%s", (_case, landing, step, centred, expected) => {
            expect(landOnStep(step, landing, centring(centred)).card).toBe(expected);
        });
    });

    describe("the menu", () => {
        it.each<[string, MergeStepLanding, Step, MergeLandingPlan["menu"]]>([
            ["opens at a user's step's row", "stepped", SHAPELESS, "openAtRow"],
            ["opens at a card link's step's row", "steppedFromCard", SHAPELESS, "openAtRow"],
            ["opens at the partner's step's row", "followed", SHAPELESS, "openAtRow"],
            ["leaves a reload's step's row closed", "reloaded", SHAPELESS, "leave"],
            ["closes the menu a step opened on a drawn step", "stepped", BOTH, "closeOpenedByStep"],
            [
                "closes the menu a step opened on the partner's drawn step",
                "followed",
                ONLY_PARTNER,
                "closeOpenedByStep",
            ],
            [
                "closes the menu a step opened on a reload's drawn step",
                "reloaded",
                BOTH,
                "closeOpenedByStep",
            ],
        ])("%s", (_case, landing, step, expected) => {
            expect(landOnStep(step, landing, canvasCentres).menu).toBe(expected);
        });
    });

    describe("what the pane tells the host", () => {
        it.each<[string, MergeStepLanding, Step, MergeLandingPlan["posts"]]>([
            [
                "a user's step: its cursor and its selection",
                "stepped",
                BOTH,
                { cursor: true, selection: true, viewport: false },
            ],
            [
                "a user's step only this pane draws: its viewport too",
                "stepped",
                ONLY_HERE,
                { cursor: true, selection: true, viewport: true },
            ],
            [
                "a user's step only the partner draws: its cursor and its selection",
                "stepped",
                ONLY_PARTNER,
                { cursor: true, selection: true, viewport: false },
            ],
            [
                "a user's step without a shape: its cursor only",
                "stepped",
                SHAPELESS,
                { cursor: true, selection: false, viewport: false },
            ],
            [
                "a user's step without a shape only this side holds: its cursor only",
                "stepped",
                { ...SHAPELESS, onOtherPane: false },
                { cursor: true, selection: false, viewport: false },
            ],
            [
                "a card link's step only this pane draws: as a user's step",
                "steppedFromCard",
                ONLY_HERE,
                { cursor: true, selection: true, viewport: true },
            ],
            [
                "a click only this pane draws: its cursor and viewport, the click reported its selection",
                "clicked",
                ONLY_HERE,
                { cursor: true, selection: false, viewport: true },
            ],
            [
                "a click both panes draw: its cursor only",
                "clicked",
                BOTH,
                { cursor: true, selection: false, viewport: false },
            ],
            [
                "the partner's step only this pane draws: its viewport only",
                "followed",
                ONLY_HERE,
                { cursor: false, selection: false, viewport: true },
            ],
            [
                "the partner's step both panes draw: nothing",
                "followed",
                BOTH,
                { cursor: false, selection: false, viewport: false },
            ],
            [
                "a reload's step only this pane draws: nothing",
                "reloaded",
                ONLY_HERE,
                { cursor: false, selection: false, viewport: false },
            ],
        ])("%s", (_case, landing, step, expected) => {
            expect(landOnStep(step, landing, canvasCentres).posts).toEqual(expected);
        });
    });
});
