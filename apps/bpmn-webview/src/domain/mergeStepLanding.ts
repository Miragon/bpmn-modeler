import type { MergePaneStep } from "@miragon/bpmn-modeler-shared";

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

/** Everything landing on a step does on the pane and tells the host, once the pane tried to centre it. */
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

/** Whether the pane tries to centre the step's element: only one its own canvas draws. */
export function centresStep(step: MergeLandingStep | undefined): boolean {
    return step !== undefined && step.onThisPane && !step.shapeless;
}

function onlyThisSideHas(step: MergeLandingStep | undefined): boolean {
    return step !== undefined && step.onThisPane && !step.onOtherPane;
}

function hasShape(step: MergeLandingStep | undefined): step is MergeLandingStep {
    return step !== undefined && !step.shapeless;
}

function canvasOf(
    step: MergeLandingStep | undefined,
    centred: boolean,
): MergeLandingPlan["canvas"] {
    if (centred) return { kind: "centred", plane: step?.plane };
    return hasShape(step) ? { kind: "followsPlane", plane: step.plane } : { kind: "staysInPlace" };
}

function menuOf(
    step: MergeLandingStep | undefined,
    traits: LandingTraits,
): MergeLandingPlan["menu"] {
    if (step === undefined || !decidesInMenu(step)) return "closeOpenedByStep";
    return traits.opensMenu ? "openAtRow" : "leave";
}

function cardOf(traits: LandingTraits, centred: boolean): MergeLandingPlan["card"] {
    if (traits.keepsCard) return "keep";
    return centred ? "followStep" : "followNothing";
}

/**
 * Lands on a step, `centred` saying whether the canvas centred the element
 * {@link centresStep} asked it to. A step selects what the pane centred, as
 * {@link diffStepSelection} decides; a click's own selection stands. A
 * shape-less step opens the menu at its row, and a step onto anything else
 * closes the menu a step opened.
 */
export function landOnStep(
    step: MergeLandingStep | undefined,
    landing: MergeStepLanding,
    centred: boolean,
): MergeLandingPlan {
    const traits = TRAITS[landing];
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
            selection: traits.ownStep && traits.selectsStep && hasShape(step),
            viewport: traits.sharesViewport && onlyThisSideHas(step) && hasShape(step),
        },
    };
}
