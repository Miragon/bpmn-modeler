import type { AddOnActionKindPayload, SourceActionKindPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { PALETTE } from "../__fixtures__/catalogs";
import {
    addOnActionEmphasis,
    Emphasis,
    revokeForgets,
    sourceActionEmphasis,
} from "./actionEmphasis";

describe("addOnActionEmphasis", () => {
    it.each<[AddOnActionKindPayload, Emphasis]>([
        ["inspect", "primary"],
        ["allow", "primary"],
        ["revoke", "danger"],
        ["enable", "secondary"],
        ["disable", "secondary"],
    ])("%s is %s", (kind, emphasis) => {
        expect(addOnActionEmphasis(kind)).toBe(emphasis);
    });
});

describe("sourceActionEmphasis", () => {
    it.each<[SourceActionKindPayload, Emphasis]>([
        ["removeMarketplace", "danger"],
        ["enableTemplates", "ghost"],
        ["disableTemplates", "ghost"],
    ])("%s is %s", (kind, emphasis) => {
        expect(sourceActionEmphasis(kind)).toBe(emphasis);
    });
});

describe("revokeForgets", () => {
    it.each([
        ["code whose folder is gone", { ...PALETTE, state: "gone" as const }, true],
        ["allowed code", PALETTE, false],
    ])("%s: %s", (_, addOn, expected) => {
        expect(revokeForgets(addOn)).toBe(expected);
    });
});
