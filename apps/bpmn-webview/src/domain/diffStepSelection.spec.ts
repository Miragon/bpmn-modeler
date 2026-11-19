import { describe, expect, it } from "vitest";

import {
    changesOnlyThisSideHas,
    type DiffStepLanding,
    type DiffStepSelection,
    diffStepSelection,
} from "./diffStepSelection";

describe("diffStepSelection", () => {
    it.each<[string, DiffStepLanding, DiffStepSelection]>([
        [
            "selects a change the pane stepped to and draws, and keeps it in view",
            { steppedHere: true, drawnHere: true, onlyThisSideHasIt: false },
            { kind: "select", keepsInView: true },
        ],
        [
            "selects a change only the stepping pane has, and keeps it in view there",
            { steppedHere: true, drawnHere: true, onlyThisSideHasIt: true },
            { kind: "select", keepsInView: true },
        ],
        [
            "selects nothing where the stepping pane lacks the change",
            { steppedHere: true, drawnHere: false, onlyThisSideHasIt: false },
            { kind: "clear" },
        ],
        [
            "selects the partner's change too, but leaves keeping it in view to the partner",
            { steppedHere: false, drawnHere: true, onlyThisSideHasIt: false },
            { kind: "select", keepsInView: false },
        ],
        [
            "keeps the change in view on the following pane when only it has the change",
            { steppedHere: false, drawnHere: true, onlyThisSideHasIt: true },
            { kind: "select", keepsInView: true },
        ],
        [
            "selects nothing where the following pane lacks the change",
            { steppedHere: false, drawnHere: false, onlyThisSideHasIt: false },
            { kind: "clear" },
        ],
    ])("%s", (_case, landing, expected) => {
        expect(diffStepSelection(landing)).toEqual(expected);
    });
});

describe("changesOnlyThisSideHas", () => {
    it.each<[string, { added: string[]; removed: string[] }, string[]]>([
        ["the after pane's added changes", { added: ["Task_New"], removed: [] }, ["Task_New"]],
        ["the before pane's removed changes", { added: [], removed: ["Task_Old"] }, ["Task_Old"]],
        ["none for a pane with neither", { added: [], removed: [] }, []],
    ])("lists %s", (_case, highlights, expected) => {
        expect([...changesOnlyThisSideHas(highlights)]).toEqual(expected);
    });
});
