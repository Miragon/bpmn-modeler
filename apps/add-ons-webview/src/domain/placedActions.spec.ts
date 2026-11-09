import { describe, expect, it } from "vitest";

import { ACME, MAIL, PALETTE, RESIZE } from "../__fixtures__/catalogs";
import { placedActions } from "./placedActions";

describe("placedActions", () => {
    it.each([
        {
            case: "Allow only at the end of the review, never on the row line",
            addOn: RESIZE,
            placed: { rowLine: [], allow: { kind: "allow", label: "Allow this content" } },
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
            case: "Review… on the row line",
            addOn: ACME,
            placed: { rowLine: [{ kind: "inspect", label: "Review…" }] },
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
