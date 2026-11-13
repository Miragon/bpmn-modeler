import { describe, expect, it } from "vitest";

import { StatusSlot } from "../../kernel/domain/statusView";
import { StatusSlotOwnership, StatusSlotRelease } from "./StatusSlotOwnership";

const SESSIONS = { a: {}, b: {} };
type SessionName = keyof typeof SESSIONS;
type Step = readonly ["claim" | "release", StatusSlot, SessionName];

function releasesAfter(steps: Step[]): StatusSlotRelease[] {
    const ownership = new StatusSlotOwnership();
    const releases: StatusSlotRelease[] = [];
    for (const [action, slot, session] of steps) {
        if (action === "claim") ownership.claim(slot, SESSIONS[session]);
        else releases.push(ownership.release(slot, SESSIONS[session]));
    }
    return releases;
}

describe("StatusSlotOwnership", () => {
    it.each<{ scenario: string; steps: Step[]; releases: StatusSlotRelease[] }>([
        {
            scenario: "hides for the session that claimed the slot",
            steps: [
                ["claim", "engineVersion", "a"],
                ["release", "engineVersion", "a"],
            ],
            releases: ["hide"],
        },
        {
            scenario: "keeps the slot when a session that never claimed it releases",
            steps: [
                ["claim", "engineVersion", "a"],
                ["release", "engineVersion", "b"],
            ],
            releases: ["keep"],
        },
        {
            scenario: "keeps the newer claim when the previous owner releases after it",
            steps: [
                ["claim", "engineVersion", "a"],
                ["claim", "engineVersion", "b"],
                ["release", "engineVersion", "a"],
                ["release", "engineVersion", "b"],
            ],
            releases: ["keep", "hide"],
        },
        {
            scenario: "keeps the slot after its owner already released",
            steps: [
                ["claim", "engineVersion", "a"],
                ["release", "engineVersion", "a"],
                ["release", "engineVersion", "a"],
            ],
            releases: ["hide", "keep"],
        },
        {
            scenario: "keeps the slot when nobody claimed it",
            steps: [["release", "engineVersion", "a"]],
            releases: ["keep"],
        },
        {
            scenario: "hides again for a session that claims after releasing",
            steps: [
                ["claim", "engineVersion", "a"],
                ["release", "engineVersion", "a"],
                ["claim", "engineVersion", "a"],
                ["release", "engineVersion", "a"],
            ],
            releases: ["hide", "hide"],
        },
        {
            scenario: "keeps each slot's owner apart from the other slots",
            steps: [
                ["claim", "engineVersion", "a"],
                ["claim", "bpmnlint", "b"],
                ["release", "bpmnlint", "a"],
                ["release", "engineVersion", "b"],
                ["release", "bpmnlint", "b"],
                ["release", "engineVersion", "a"],
            ],
            releases: ["keep", "keep", "hide", "hide"],
        },
        {
            scenario: "releases only the named slot of a session that owns two",
            steps: [
                ["claim", "engineVersion", "a"],
                ["claim", "deploymentTarget", "a"],
                ["release", "engineVersion", "a"],
                ["release", "engineVersion", "a"],
                ["release", "deploymentTarget", "a"],
            ],
            releases: ["hide", "keep", "hide"],
        },
    ])("$scenario", ({ steps, releases }) => {
        expect(releasesAfter(steps)).toEqual(releases);
    });
});
