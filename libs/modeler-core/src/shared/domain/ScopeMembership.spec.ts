import { describe, expect, it } from "vitest";

import { ScopeMembership } from "./ScopeMembership";

type Step = ["assign", string, string] | ["release", string] | ["clear"];

function outcomesOf(steps: Step[]): unknown[] {
    const membership = new ScopeMembership();
    return steps.map((step) => {
        switch (step[0]) {
            case "assign":
                return membership.assign(step[1], step[2]);
            case "release":
                return membership.release(step[1]);
            case "clear":
                return membership.clear();
        }
    });
}

describe("ScopeMembership", () => {
    it.each<{ behaviour: string; steps: Step[]; outcomes: unknown[] }>([
        {
            behaviour: "reports a new scope on first assignment",
            steps: [["assign", "e1", "A"]],
            outcomes: [{ isNewScope: true }],
        },
        {
            behaviour: "lets a second editor join an open scope",
            steps: [
                ["assign", "e1", "A"],
                ["assign", "e2", "A"],
            ],
            outcomes: [{ isNewScope: true }, { isNewScope: false }],
        },
        {
            behaviour: "is idempotent for the same key",
            steps: [
                ["assign", "e1", "A"],
                ["assign", "e1", "A"],
                ["release", "e1"],
            ],
            outcomes: [{ isNewScope: true }, { isNewScope: false }, "A"],
        },
        {
            behaviour: "moves an editor and reports the scope it left empty",
            steps: [
                ["assign", "e1", "A"],
                ["assign", "e1", "B"],
                ["release", "e1"],
            ],
            outcomes: [{ isNewScope: true }, { isNewScope: true, emptiedScope: "A" }, "B"],
        },
        {
            behaviour: "moves an editor into a scope another editor opened",
            steps: [
                ["assign", "e1", "A"],
                ["assign", "e2", "B"],
                ["assign", "e1", "B"],
            ],
            outcomes: [
                { isNewScope: true },
                { isNewScope: true },
                { isNewScope: false, emptiedScope: "A" },
            ],
        },
        {
            behaviour: "keeps a scope another editor still uses when one moves away",
            steps: [
                ["assign", "e1", "A"],
                ["assign", "e2", "A"],
                ["assign", "e1", "B"],
                ["release", "e2"],
            ],
            outcomes: [{ isNewScope: true }, { isNewScope: false }, { isNewScope: true }, "A"],
        },
        {
            behaviour: "reports a scope empty only when its last editor leaves",
            steps: [
                ["assign", "e1", "A"],
                ["assign", "e2", "A"],
                ["release", "e1"],
                ["release", "e2"],
            ],
            outcomes: [{ isNewScope: true }, { isNewScope: false }, undefined, "A"],
        },
        {
            behaviour: "reports an emptied scope once",
            steps: [
                ["assign", "e1", "A"],
                ["release", "e1"],
                ["release", "e1"],
            ],
            outcomes: [{ isNewScope: true }, "A", undefined],
        },
        {
            behaviour: "reports nothing on release of an unknown editor",
            steps: [["release", "e1"]],
            outcomes: [undefined],
        },
        {
            behaviour: "reopens a scope after its last editor left",
            steps: [
                ["assign", "e1", "A"],
                ["release", "e1"],
                ["assign", "e2", "A"],
            ],
            outcomes: [{ isNewScope: true }, "A", { isNewScope: true }],
        },
        {
            behaviour: "forgets every editor when cleared",
            steps: [["assign", "e1", "A"], ["clear"], ["assign", "e1", "A"], ["release", "e2"]],
            outcomes: [{ isNewScope: true }, undefined, { isNewScope: true }, undefined],
        },
    ])("$behaviour", ({ steps, outcomes }) => {
        expect(outcomesOf(steps)).toEqual(outcomes);
    });
});
