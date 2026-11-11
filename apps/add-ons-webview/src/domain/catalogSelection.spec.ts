import type { AddOnGroupPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { ACME, CATALOG, MAIL, PALETTE, RESIZE, without } from "../__fixtures__/catalogs";
import { firstToShow, settledSelection } from "./catalogSelection";

const ALL = CATALOG.groups;
const SETTLED: readonly AddOnGroupPayload[] = without(RESIZE.id, without(ACME.id)).groups;
const LIST = [PALETTE.id, RESIZE.id, ACME.id, MAIL.id];
const ALL_IN_SIGHT: ReadonlySet<string> = new Set(LIST);
const RESIZE_HIDDEN: ReadonlySet<string> = new Set([PALETTE.id, ACME.id, MAIL.id]);

describe("firstToShow", () => {
    it.each<[string, readonly AddOnGroupPayload[], ReadonlySet<string>, string | undefined]>([
        ["the first add-on to review", ALL, ALL_IN_SIGHT, RESIZE.id],
        ["else the first add-on", SETTLED, ALL_IN_SIGHT, PALETTE.id],
        ["nothing in an empty list", [], ALL_IN_SIGHT, undefined],
        ["the first in sight to review, past one a closed head hides", ALL, RESIZE_HIDDEN, ACME.id],
        [
            "the first in sight when none in sight needs a review",
            ALL,
            new Set([MAIL.id, PALETTE.id]),
            PALETTE.id,
        ],
        ["nothing while every head is closed", ALL, new Set(), undefined],
    ])("is %s", (_, groups, inSight, expected) => {
        expect(firstToShow(groups, inSight)).toBe(expected);
    });
});

describe("settledSelection", () => {
    it.each<{
        case: string;
        remembered: string | undefined;
        shown: readonly AddOnGroupPayload[];
        before: readonly string[];
        inSight?: ReadonlySet<string>;
        expected: string | undefined;
    }>([
        {
            case: "keeps a selection the list shows",
            remembered: MAIL.id,
            shown: ALL,
            before: LIST,
            expected: MAIL.id,
        },
        {
            case: "starts a tab on the first add-on to review",
            remembered: undefined,
            shown: ALL,
            before: [],
            expected: RESIZE.id,
        },
        {
            case: "moves a hidden selection to the next add-on the list shows",
            remembered: RESIZE.id,
            shown: without(RESIZE.id).groups,
            before: LIST,
            expected: ACME.id,
        },
        {
            case: "moves it to the add-on before when none follows",
            remembered: MAIL.id,
            shown: without(MAIL.id).groups,
            before: LIST,
            expected: ACME.id,
        },
        {
            case: "falls back to the first to show when no neighbour is left",
            remembered: MAIL.id,
            shown: without(MAIL.id).groups,
            before: [MAIL.id],
            expected: RESIZE.id,
        },
        {
            case: "falls back to the first to show for an id the list never showed",
            remembered: "plugin:/elsewhere",
            shown: ALL,
            before: LIST,
            expected: RESIZE.id,
        },
        {
            case: "selects nothing in an empty list",
            remembered: MAIL.id,
            shown: [],
            before: LIST,
            expected: undefined,
        },
        {
            case: "keeps a listed selection a closed head hides",
            remembered: RESIZE.id,
            shown: ALL,
            before: LIST,
            inSight: RESIZE_HIDDEN,
            expected: RESIZE.id,
        },
        {
            case: "skips a neighbour a closed head hides and takes the one before",
            remembered: RESIZE.id,
            shown: without(RESIZE.id).groups,
            before: LIST,
            inSight: new Set([PALETTE.id]),
            expected: PALETTE.id,
        },
        {
            case: "selects nothing when only hidden rows are left",
            remembered: RESIZE.id,
            shown: without(RESIZE.id).groups,
            before: LIST,
            inSight: new Set(),
            expected: undefined,
        },
        {
            case: "starts a tab on the first in sight to review",
            remembered: undefined,
            shown: ALL,
            before: [],
            inSight: RESIZE_HIDDEN,
            expected: ACME.id,
        },
    ])("$case", ({ remembered, shown, before, inSight = ALL_IN_SIGHT, expected }) => {
        expect(settledSelection(remembered, shown, before, inSight)).toBe(expected);
    });
});
