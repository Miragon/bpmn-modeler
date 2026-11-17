import { describe, expect, it } from "vitest";

import {
    MERGE_BAR_FITS,
    type MergeBarFit,
    mergeBarFit,
    type MergeBarFitEffects,
    mergeBarFitEffects,
} from "./mergeBarFit";

describe("mergeBarFit", () => {
    it("drops the caption's branch and commit, then the counts' labels, then moves Build into the menu, then tightens the gaps", () => {
        expect(MERGE_BAR_FITS).toStrictEqual([
            "full",
            "withoutDetail",
            "withoutLabels",
            "withoutBuild",
            "compact",
        ]);
    });

    it.each<[string, readonly MergeBarFit[], MergeBarFit]>([
        ["says everything where it fits", [], "full"],
        ["drops the caption's detail first", ["full"], "withoutDetail"],
        ["then the counts' labels", ["full", "withoutDetail"], "withoutLabels"],
        [
            "then moves Build into the menu",
            ["full", "withoutDetail", "withoutLabels"],
            "withoutBuild",
        ],
        ["then tightens the gaps", MERGE_BAR_FITS.slice(0, -1), "compact"],
        ["keeps the least where even that overflows", MERGE_BAR_FITS, "compact"],
    ])("%s", (_case, overflowing, expected) => {
        expect(mergeBarFit((fit) => overflowing.includes(fit))).toBe(expected);
    });
});

describe("mergeBarFitEffects", () => {
    const none: MergeBarFitEffects = {
        detailHidden: false,
        labelsHidden: false,
        buildInMenu: false,
        compact: false,
    };

    it.each<[MergeBarFit, MergeBarFitEffects]>([
        ["full", none],
        ["withoutDetail", { ...none, detailHidden: true }],
        ["withoutLabels", { ...none, detailHidden: true, labelsHidden: true }],
        ["withoutBuild", { ...none, detailHidden: true, labelsHidden: true, buildInMenu: true }],
        ["compact", { detailHidden: true, labelsHidden: true, buildInMenu: true, compact: true }],
    ])("a %s bar also does what every fit before it does", (fit, effects) => {
        expect(mergeBarFitEffects(fit)).toStrictEqual(effects);
    });
});
