/**
 * How much a merge pane's bar says, from all of it down to what fits one
 * line on VS Code's narrowest editor: the caption's branch and commit go
 * first, then the counts' labels, which their tooltips keep, then
 * Build moves into the "…" menu, then the gaps tighten. The caption's side
 * word, the counts and the stepper always stay on the bar.
 */
export const MERGE_BAR_FITS = [
    "full",
    "withoutDetail",
    "withoutLabels",
    "withoutBuild",
    "compact",
] as const;

export type MergeBarFit = (typeof MERGE_BAR_FITS)[number];

/** The first fit whose line does not overflow, or the last, which says the least. */
export function mergeBarFit(overflows: (fit: MergeBarFit) => boolean): MergeBarFit {
    return MERGE_BAR_FITS.find((fit) => !overflows(fit)) ?? "compact";
}

/** What a fit does to the bar; each fit also does what every fit before it does. */
export interface MergeBarFitEffects {
    readonly detailHidden: boolean;
    readonly labelsHidden: boolean;
    /** Build left the bar for the first item of the "…" menu. */
    readonly buildInMenu: boolean;
    readonly compact: boolean;
}

const FIRST_FIT_OF: Readonly<Record<keyof MergeBarFitEffects, MergeBarFit>> = {
    detailHidden: "withoutDetail",
    labelsHidden: "withoutLabels",
    buildInMenu: "withoutBuild",
    compact: "compact",
};

export function mergeBarFitEffects(fit: MergeBarFit): MergeBarFitEffects {
    const reached = (effect: keyof MergeBarFitEffects) =>
        MERGE_BAR_FITS.indexOf(fit) >= MERGE_BAR_FITS.indexOf(FIRST_FIT_OF[effect]);
    return {
        detailHidden: reached("detailHidden"),
        labelsHidden: reached("labelsHidden"),
        buildInMenu: reached("buildInMenu"),
        compact: reached("compact"),
    };
}
