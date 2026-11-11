import type { AddOnPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { ACME, MAIL, PALETTE, RESIZE } from "../__fixtures__/catalogs";
import { rowStatusOf, stateToneOf, StatusTone } from "./addOnStatus";

const GONE: AddOnPayload = { ...PALETTE, state: "gone", stateText: "Folder gone" };
const DISABLED: AddOnPayload = { ...MAIL, state: "disabled", stateText: "Disabled" };
const BROKEN: AddOnPayload = { ...RESIZE, problem: "plugin.json is not valid JSON." };

describe("stateToneOf", () => {
    it.each<[string, AddOnPayload, StatusTone]>([
        ["code that offers Allow waits for a review", RESIZE, "warning"],
        ["code that offers Review… waits for a review", ACME, "warning"],
        ["allowed code is settled", PALETTE, "success"],
        ["an enabled template is settled", MAIL, "success"],
        ["a disabled template is neutral", DISABLED, "neutral"],
        ["code whose folder is gone is neutral", GONE, "neutral"],
    ])("%s", (_, addOn, tone) => {
        expect(stateToneOf(addOn)).toBe(tone);
    });
});

describe("rowStatusOf", () => {
    it.each<[string, AddOnPayload, { tone: StatusTone; word: string }]>([
        ["a problem outranks the state", BROKEN, { tone: "danger", word: "Problem" }],
        ["a review names itself", RESIZE, { tone: "warning", word: "Needs review" }],
        ["a settled state says the core's text", PALETTE, { tone: "success", word: "Allowed" }],
        ["a neutral state says the core's text", DISABLED, { tone: "neutral", word: "Disabled" }],
    ])("%s", (_, addOn, status) => {
        expect(rowStatusOf(addOn)).toEqual(status);
    });
});
