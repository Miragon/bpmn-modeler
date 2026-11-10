import type { AddOnGroupPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { ACME, CATALOG, MAIL, PALETTE, RESIZE, without } from "../__fixtures__/catalogs";
import { firstToShow, settledSelection } from "./catalogSelection";

const ALL = CATALOG.groups;
const SETTLED: readonly AddOnGroupPayload[] = without(RESIZE.id, without(ACME.id)).groups;
const LIST = [PALETTE.id, RESIZE.id, ACME.id, MAIL.id];

describe("firstToShow", () => {
    it.each<[string, readonly AddOnGroupPayload[], string | undefined]>([
        ["the first add-on to review", ALL, RESIZE.id],
        ["else the first add-on", SETTLED, PALETTE.id],
        ["nothing in an empty list", [], undefined],
    ])("is %s", (_, groups, expected) => {
        expect(firstToShow(groups)).toBe(expected);
    });
});

describe("settledSelection", () => {
    it.each<{
        case: string;
        remembered: string | undefined;
        shown: readonly AddOnGroupPayload[];
        before: readonly string[];
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
    ])("$case", ({ remembered, shown, before, expected }) => {
        expect(settledSelection(remembered, shown, before)).toBe(expected);
    });
});
