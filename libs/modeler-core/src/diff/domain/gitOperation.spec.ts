import { describe, expect, it } from "vitest";

import { ConflictMarkerReading } from "../../kernel/domain/conflictMarkers";
import { GitRefFacts } from "./conflictFacts";
import { GitOperation, gitOperationOf } from "./gitOperation";

const commit = (hash: string) => ({ hash, subject: `commit ${hash}` });
const NO_MARKERS: ConflictMarkerReading = { hasMarkers: false };
const markers = (incomingLabel: string): ConflictMarkerReading => ({
    hasMarkers: true,
    currentLabel: "Updated upstream",
    incomingLabel,
});

describe("gitOperationOf", () => {
    it.each<[string, GitRefFacts, ConflictMarkerReading, GitOperation]>([
        [
            "a rebase seen only through REBASE_HEAD",
            { rebaseHead: commit("r1"), rebaseInProgress: true },
            NO_MARKERS,
            "rebase",
        ],
        [
            "a rebase seen only through the Git extension's rebase state",
            { rebaseCommit: commit("r1") },
            NO_MARKERS,
            "rebase",
        ],
        ["a merge", { headName: "main", mergeHead: commit("m1") }, NO_MARKERS, "merge"],
        [
            "a cherry-pick",
            { headName: "main", cherryPickHead: commit("c1") },
            NO_MARKERS,
            "cherryPick",
        ],
        ["a stash pop", { headName: "main" }, markers("Stashed changes"), "stash"],
        ["markers of an unknown source", { headName: "main" }, markers("feature"), "unknown"],
        ["no refs and no markers", {}, NO_MARKERS, "unknown"],
        [
            "a rebase that stopped on a merge commit it replays",
            { rebaseHead: commit("r1"), rebaseInProgress: true, mergeHead: commit("m1") },
            NO_MARKERS,
            "rebase",
        ],
        [
            "a merge that also left a cherry-pick ref behind",
            { mergeHead: commit("m1"), cherryPickHead: commit("c1") },
            NO_MARKERS,
            "merge",
        ],
        [
            "a merge after an earlier rebase left REBASE_HEAD behind",
            { headName: "main", rebaseHead: commit("r0"), mergeHead: commit("m1") },
            NO_MARKERS,
            "merge",
        ],
        [
            "a cherry-pick after an earlier rebase left REBASE_HEAD behind",
            { headName: "main", rebaseHead: commit("r0"), cherryPickHead: commit("c1") },
            NO_MARKERS,
            "cherryPick",
        ],
        [
            "a stash pop after an earlier rebase left REBASE_HEAD behind",
            { headName: "main", rebaseHead: commit("r0") },
            markers("Stashed changes"),
            "stash",
        ],
        [
            "a cherry-pick whose markers read like a stash",
            { cherryPickHead: commit("c1") },
            markers("Stashed changes"),
            "cherryPick",
        ],
    ])("%s → %s", (_case, refs, reading, expected) => {
        expect(gitOperationOf(refs, reading)).toBe(expected);
    });
});
