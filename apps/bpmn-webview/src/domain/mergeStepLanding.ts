import type { MergePaneStates, MergePaneStep } from "@miragon/bpmn-modeler-shared";

import { type DiffStepSelection, diffStepSelection } from "./diffStepSelection";
import { decidesInMenu } from "./mergePadDecisions";

/**
 * Who moved a merge pane's cursor onto a step: its user with ‹ ›, a menu row
 * or a note (`stepped`), a link on the outcome card (`steppedFromCard`) or a
 * click on the canvas (`clicked`); the partner pane (`followed`); or the
 * host giving a reloaded pane the tab's step back (`reloaded`).
 */
export const MERGE_STEP_LANDINGS = [
    "stepped",
    "steppedFromCard",
    "clicked",
    "followed",
    "reloaded",
] as const;

export type MergeStepLanding = (typeof MERGE_STEP_LANDINGS)[number];

export type MergeLandingStep = Pick<
    MergePaneStep,
    "shapeless" | "onThisPane" | "onOtherPane" | "plane"
>;

/** Everything landing on a step does on the pane and tells the host. */
export interface MergeLandingPlan {
    /**
     * A step the pane does not centre leaves it in place, since a neighbour
     * here would point elsewhere, but shows the plane the partner draws it
     * on, so their viewports still match.
     */
    readonly canvas:
        | { readonly kind: "centred"; readonly plane: string | undefined }
        | { readonly kind: "followsPlane"; readonly plane: string | undefined }
        | { readonly kind: "staysInPlace" };
    readonly selection: DiffStepSelection | { readonly kind: "leave" };
    readonly card: "followStep" | "followNothing" | "keep";
    readonly menu: "openAtRow" | "closeOpenedByStep" | "leave";
    readonly posts: {
        readonly cursor: boolean;
        /** A click reported its own already, and a shape-less step would select its process's root on the partner. */
        readonly selection: boolean;
        /** The partner draws nothing for a step only this pane draws, so it takes this pane's viewport. */
        readonly viewport: boolean;
    };
}

interface LandingTraits {
    /** This pane's user moved the cursor, so the host and the partner follow it. */
    readonly ownStep: boolean;
    readonly selectsStep: boolean;
    readonly keepsCard: boolean;
    readonly opensMenu: boolean;
    readonly sharesViewport: boolean;
}

const TRAITS: Readonly<Record<MergeStepLanding, LandingTraits>> = {
    stepped: {
        ownStep: true,
        selectsStep: true,
        keepsCard: false,
        opensMenu: true,
        sharesViewport: true,
    },
    steppedFromCard: {
        ownStep: true,
        selectsStep: true,
        keepsCard: true,
        opensMenu: true,
        sharesViewport: true,
    },
    clicked: {
        ownStep: true,
        selectsStep: false,
        keepsCard: false,
        opensMenu: true,
        sharesViewport: true,
    },
    followed: {
        ownStep: false,
        selectsStep: true,
        keepsCard: false,
        opensMenu: true,
        sharesViewport: true,
    },
    // The host kept the tab's step; a reloaded pane goes back to it without opening the menu or moving the partner.
    reloaded: {
        ownStep: false,
        selectsStep: true,
        keepsCard: false,
        opensMenu: false,
        sharesViewport: false,
    },
};

/** The step `id` names among all steps, or none for an element that is no step. */
export function stepNamed(
    states: Pick<MergePaneStates, "allSteps">,
    id: string | undefined,
): MergePaneStep | undefined {
    return id === undefined ? undefined : states.allSteps.find((step) => step.id === id);
}

/** The step a click on the canvas lands on: an element the user can pick, if it is a step the cursor is not on yet. */
export function stepClicked(
    states: Pick<MergePaneStates, "allSteps" | "pickable">,
    clicked: string | undefined,
    cursorId: string | undefined,
): MergePaneStep | undefined {
    if (clicked === cursorId || !states.pickable.some(({ id }) => id === clicked)) return undefined;
    return stepNamed(states, clicked);
}

/** The step the host kept for the tab, which a pane without a step of its own, as after a reload, takes back. */
export function stepTakenBack(
    states: Pick<MergePaneStates, "allSteps" | "stepping">,
    cursorId: string | undefined,
): MergePaneStep | undefined {
    return cursorId === undefined ? stepNamed(states, states.stepping.cursor) : undefined;
}

/** Only an element its own canvas draws can be centred. */
function centresStep(step: MergeLandingStep): boolean {
    return step.onThisPane && !step.shapeless;
}

function onlyThisSideHas(step: MergeLandingStep): boolean {
    return step.onThisPane && !step.onOtherPane;
}

function canvasOf(step: MergeLandingStep, centred: boolean): MergeLandingPlan["canvas"] {
    if (centred) return { kind: "centred", plane: step.plane };
    return step.shapeless ? { kind: "staysInPlace" } : { kind: "followsPlane", plane: step.plane };
}

function menuOf(step: MergeLandingStep, traits: LandingTraits): MergeLandingPlan["menu"] {
    if (!decidesInMenu(step)) return "closeOpenedByStep";
    return traits.opensMenu ? "openAtRow" : "leave";
}

function cardOf(traits: LandingTraits, centred: boolean): MergeLandingPlan["card"] {
    if (traits.keepsCard) return "keep";
    return centred ? "followStep" : "followNothing";
}

/**
 * Lands on a step, calling `tryCentre` only for a step its own canvas draws;
 * it answers whether the canvas found the element and centred it. A step
 * selects what the pane centred, as {@link diffStepSelection} decides; a
 * click's own selection stands. A shape-less step opens the menu at its
 * row, and a step onto anything else closes the menu a step opened.
 */
export function landOnStep(
    step: MergeLandingStep,
    landing: MergeStepLanding,
    tryCentre: () => boolean,
): MergeLandingPlan {
    const traits = TRAITS[landing];
    const centred = centresStep(step) && tryCentre();
    return {
        canvas: canvasOf(step, centred),
        selection: traits.selectsStep
            ? diffStepSelection({
                  steppedHere: traits.ownStep,
                  drawnHere: centred,
                  onlyThisSideHasIt: onlyThisSideHas(step),
              })
            : { kind: "leave" },
        card: cardOf(traits, centred),
        menu: menuOf(step, traits),
        posts: {
            cursor: traits.ownStep,
            selection: traits.ownStep && traits.selectsStep && !step.shapeless,
            viewport: traits.sharesViewport && onlyThisSideHas(step) && !step.shapeless,
        },
    };
}
