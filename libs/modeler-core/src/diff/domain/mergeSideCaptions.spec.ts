import { describe, expect, it } from "vitest";

import type {
    ConflictMarkerReading,
    MergeSide,
    MergeSideCaption,
} from "@miragon/bpmn-modeler-types/domain";

import { GitRefFacts } from "./conflictFacts";
import { GitOperation } from "./gitOperation";
import { mergeSideCaptions } from "./mergeSideCaptions";

const HEAD = { hash: "1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", subject: "Check the order" };
const OTHER = { hash: "9f8e7d6bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", subject: "Rename the check" };

const markers = (currentLabel: string, incomingLabel: string): ConflictMarkerReading => ({
    hasMarkers: true,
    currentLabel,
    incomingLabel,
});

type Captions = Record<MergeSide, MergeSideCaption>;

describe("mergeSideCaptions", () => {
    it.each<[string, GitOperation, GitRefFacts, ConflictMarkerReading, Captions]>([
        [
            "names the user's branch and the merged branch of a merge",
            "merge",
            { headName: "main", head: HEAD, mergeHead: OTHER },
            markers("HEAD", "feature"),
            {
                current: {
                    side: "current",
                    role: "branch",
                    ref: "main",
                    shortHash: "1111111",
                    subject: "Check the order",
                },
                incoming: {
                    side: "incoming",
                    role: "upstream",
                    ref: "feature",
                    shortHash: "9f8e7d6",
                    subject: "Rename the check",
                },
            },
        ],
        [
            "tells the user's own commit apart during a rebase, where incoming is theirs",
            "rebase",
            { head: HEAD, rebaseHead: OTHER },
            markers("HEAD", "9f8e7d6 (Rename the check)"),
            {
                current: {
                    side: "current",
                    role: "upstream",
                    shortHash: "1111111",
                    subject: "Check the order",
                },
                incoming: {
                    side: "incoming",
                    role: "yourCommit",
                    shortHash: "9f8e7d6",
                    subject: "Rename the check",
                },
            },
        ],
        [
            "falls back to the Git extension's rebase commit without REBASE_HEAD",
            "rebase",
            { head: HEAD, rebaseCommit: OTHER },
            { hasMarkers: false },
            {
                current: {
                    side: "current",
                    role: "upstream",
                    shortHash: "1111111",
                    subject: "Check the order",
                },
                incoming: {
                    side: "incoming",
                    role: "yourCommit",
                    shortHash: "9f8e7d6",
                    subject: "Rename the check",
                },
            },
        ],
        [
            "names the picked commit of a cherry-pick",
            "cherryPick",
            { headName: "main", head: HEAD, cherryPickHead: OTHER },
            markers("HEAD", "9f8e7d6 (Rename the check)"),
            {
                current: {
                    side: "current",
                    role: "branch",
                    ref: "main",
                    shortHash: "1111111",
                    subject: "Check the order",
                },
                incoming: {
                    side: "incoming",
                    role: "upstream",
                    shortHash: "9f8e7d6",
                    subject: "Rename the check",
                },
            },
        ],
        [
            "names the stash of a stash pop",
            "stash",
            { headName: "main", head: HEAD },
            markers("Updated upstream", "Stashed changes"),
            {
                current: {
                    side: "current",
                    role: "branch",
                    ref: "main",
                    shortHash: "1111111",
                    subject: "Check the order",
                },
                incoming: { side: "incoming", role: "stash" },
            },
        ],
        [
            "keeps the marker label when the operation is unknown",
            "unknown",
            {},
            markers("ours", "theirs"),
            {
                current: { side: "current", role: "unknown", ref: "ours" },
                incoming: { side: "incoming", role: "unknown", ref: "theirs" },
            },
        ],
        [
            "names the incoming side of a git pull by its short hash, not the marker's full hash",
            "merge",
            { headName: "main", head: HEAD, mergeHead: OTHER },
            markers("HEAD", OTHER.hash),
            {
                current: {
                    side: "current",
                    role: "branch",
                    ref: "main",
                    shortHash: "1111111",
                    subject: "Check the order",
                },
                incoming: {
                    side: "incoming",
                    role: "upstream",
                    shortHash: "9f8e7d6",
                    subject: "Rename the check",
                },
            },
        ],
        [
            "shortens a marker's full hash when the operation is unknown",
            "unknown",
            {},
            markers(HEAD.hash, OTHER.hash),
            {
                current: { side: "current", role: "unknown", ref: "1111111" },
                incoming: { side: "incoming", role: "unknown", ref: "9f8e7d6" },
            },
        ],
        [
            "says nothing it does not know",
            "unknown",
            {},
            { hasMarkers: false },
            {
                current: { side: "current", role: "unknown" },
                incoming: { side: "incoming", role: "unknown" },
            },
        ],
    ])("%s", (_case, operation, refs, reading, expected) => {
        expect(mergeSideCaptions(operation, refs, reading)).toStrictEqual(expected);
    });
});
