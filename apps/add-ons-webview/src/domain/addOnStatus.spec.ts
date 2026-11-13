import type { AddOnPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { ACME, MAIL, PALETTE, RESIZE } from "../__fixtures__/catalogs";
import { rowStatusOf, stateToneOf, StatusTone } from "./addOnStatus";

const UNREADABLE: AddOnPayload = {
    ...RESIZE,
    review: undefined,
    problem: "Cannot be allowed: plugin.json is not valid JSON.",
    actions: [],
};
const DISABLED: AddOnPayload = { ...MAIL, state: "disabled", stateText: "Disabled" };
const BROKEN: AddOnPayload = { ...RESIZE, problem: "plugin.json is not valid JSON." };

describe("stateToneOf", () => {
    it.each<[string, AddOnPayload, StatusTone]>([
        ["code that offers Allow waits for a review", RESIZE, "warning"],
        ["a rule package that offers Allow waits for a review", ACME, "warning"],
        ["allowed code is settled", PALETTE, "success"],
        ["an enabled template is settled", MAIL, "success"],
        ["a disabled template is neutral", DISABLED, "neutral"],
        ["code that cannot be read and offers nothing is neutral", UNREADABLE, "neutral"],
    ])("%s", (_, addOn, tone) => {
        expect(stateToneOf(addOn)).toBe(tone);
    });
});

describe("rowStatusOf", () => {
    it.each<[string, AddOnPayload, { tone: StatusTone; word: string } | undefined]>([
        ["a problem outranks the state", BROKEN, { tone: "danger", word: "Not loaded" }],
        ["code that offers Allow waits", RESIZE, { tone: "warning", word: "Waiting" }],
        ["allowed code stays silent", PALETTE, undefined],
        ["an enabled template stays silent", MAIL, undefined],
        ["a neutral state says the core's text", DISABLED, { tone: "neutral", word: "Disabled" }],
    ])("%s", (_, addOn, status) => {
        expect(rowStatusOf(addOn)).toEqual(status);
    });
});
