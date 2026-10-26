import { describe, expect, it } from "vitest";

import { StatusItemOwnership, StatusItemRelease } from "./StatusItemOwnership";

type Step = readonly ["claim" | "release", string];

function releasesAfter(steps: Step[]): StatusItemRelease[] {
    const ownership = new StatusItemOwnership();
    const releases: StatusItemRelease[] = [];
    for (const [action, editorId] of steps) {
        if (action === "claim") ownership.claim(editorId);
        else releases.push(ownership.release(editorId));
    }
    return releases;
}

describe("StatusItemOwnership", () => {
    it.each<{ scenario: string; steps: Step[]; releases: StatusItemRelease[] }>([
        {
            scenario: "hides for the editor that claimed the item",
            steps: [
                ["claim", "a"],
                ["release", "a"],
            ],
            releases: ["hide"],
        },
        {
            scenario: "keeps the item when an editor that never claimed it releases",
            steps: [
                ["claim", "a"],
                ["release", "b"],
            ],
            releases: ["keep"],
        },
        {
            scenario: "keeps the newer claim when the previous owner blurs after it",
            steps: [
                ["claim", "a"],
                ["claim", "b"],
                ["release", "a"],
                ["release", "b"],
            ],
            releases: ["keep", "hide"],
        },
        {
            scenario: "keeps the item after its owner already released",
            steps: [
                ["claim", "a"],
                ["release", "a"],
                ["release", "a"],
            ],
            releases: ["hide", "keep"],
        },
        {
            scenario: "keeps the item when nobody claimed it",
            steps: [["release", "a"]],
            releases: ["keep"],
        },
        {
            scenario: "hides again for an editor that claims after releasing",
            steps: [
                ["claim", "a"],
                ["release", "a"],
                ["claim", "a"],
                ["release", "a"],
            ],
            releases: ["hide", "hide"],
        },
    ])("$scenario", ({ steps, releases }) => {
        expect(releasesAfter(steps)).toEqual(releases);
    });
});
