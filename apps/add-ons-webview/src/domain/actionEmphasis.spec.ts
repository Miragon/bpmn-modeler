import type { AddOnActionKindPayload, SourceActionKindPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { addOnActionEmphasis, Emphasis, sourceActionEmphasis } from "./actionEmphasis";

describe("addOnActionEmphasis", () => {
    it.each<[AddOnActionKindPayload, Emphasis]>([
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
