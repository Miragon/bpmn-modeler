import { describe, expect, it } from "vitest";

import { headSummaryText, matchCountText, sourceActionsText } from "./chromeTexts";

describe("headSummaryText", () => {
    it.each([
        [1, 0, "1 add-on"],
        [9, 0, "9 add-ons"],
        [9, 1, "9 add-ons, 1 needs review"],
        [9, 3, "9 add-ons, 3 need review"],
    ])("says %i with %i to review as %s", (total, needingReview, text) => {
        expect(headSummaryText(total, needingReview)).toBe(text);
    });
});

describe("matchCountText", () => {
    it.each([
        [0, "No add-ons match your search and filters."],
        [1, "1 add-on shown"],
        [4, "4 add-ons shown"],
    ])("says %i as %s", (count, text) => {
        expect(matchCountText(count)).toBe(text);
    });
});

describe("sourceActionsText", () => {
    it("names the source the menu belongs to", () => {
        expect(sourceActionsText("/shared")).toBe("Source actions: /shared");
    });
});
