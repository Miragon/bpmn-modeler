import { describe, expect, it } from "vitest";

import { MAIL, PALETTE, RESIZE } from "../__fixtures__/catalogs";
import { placedActions, reviewOf } from "./placedActions";

describe("placedActions", () => {
    it.each([
        {
            case: "Allow only at the end of the review, never on the row line",
            addOn: RESIZE,
            placed: { rowLine: [], allow: { kind: "allow", label: "Allow" } },
        },
        {
            case: "no Allow at all for a row that offers it without a review",
            addOn: { ...RESIZE, review: undefined },
            placed: { rowLine: [] },
        },
        {
            case: "Revoke on the row line",
            addOn: PALETTE,
            placed: { rowLine: [{ kind: "revoke", label: "Revoke" }] },
        },
        {
            case: "a template's switch on the row line",
            addOn: MAIL,
            placed: { rowLine: [{ kind: "disable", label: "Disable" }] },
        },
    ])("places $case", ({ addOn, placed }) => {
        expect(placedActions(addOn)).toEqual(placed);
    });
});

describe("reviewOf", () => {
    it.each([
        {
            case: "the review of a code row that offers Allow",
            addOn: RESIZE,
            review: RESIZE.review,
        },
        { case: "none for an allowed code row", addOn: PALETTE, review: undefined },
        { case: "none for a template", addOn: MAIL, review: undefined },
    ])("gives $case", ({ addOn, review }) => {
        expect(reviewOf(addOn)).toEqual(review);
    });
});
