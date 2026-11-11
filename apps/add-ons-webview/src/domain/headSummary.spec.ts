import { describe, expect, it } from "vitest";

import { ACME, MAIL, PALETTE, RESIZE } from "../__fixtures__/catalogs";
import { headSummaryOf } from "./headSummary";

describe("headSummaryOf", () => {
    it.each([
        ["nothing", [], { total: 0, needingReview: 0 }],
        ["settled add-ons", [PALETTE, MAIL], { total: 2, needingReview: 0 }],
        ["add-ons to review", [PALETTE, RESIZE, ACME], { total: 3, needingReview: 2 }],
    ])("counts %s", (_, addOns, summary) => {
        expect(headSummaryOf(addOns)).toEqual(summary);
    });
});
