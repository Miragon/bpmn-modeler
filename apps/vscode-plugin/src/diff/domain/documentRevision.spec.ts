import { describe, expect, it } from "vitest";

import { DiffRevision } from "@miragon/bpmn-modeler-core";

import { isGitProvidedDocument, revisionOfDocument } from "./documentRevision";

const gitQuery = (ref: string) => JSON.stringify({ path: "/repo/order.bpmn", ref });

describe("revisionOfDocument", () => {
    it.each<[string, { scheme: string; query: string }, DiffRevision]>([
        ["a file as the working tree", { scheme: "file", query: "" }, { kind: "working-tree" }],
        [
            "a Git document at a commit",
            { scheme: "git", query: gitQuery("HEAD") },
            { kind: "ref", ref: "HEAD" },
        ],
        [
            "a Git document at an older commit",
            { scheme: "git", query: gitQuery("HEAD~1") },
            { kind: "ref", ref: "HEAD~1" },
        ],
        ["a Git document in the index", { scheme: "git", query: gitQuery("") }, { kind: "index" }],
        [
            "the base of a working tree change, the index or HEAD when nothing is staged",
            { scheme: "git", query: gitQuery("~") },
            { kind: "index-or-head" },
        ],
        [
            "a Git document whose query names no ref",
            { scheme: "git", query: "{}" },
            { kind: "unknown" },
        ],
        [
            "a Git document whose query is no JSON",
            { scheme: "git", query: "HEAD" },
            { kind: "unknown" },
        ],
        ["a document of another provider", { scheme: "gitfs", query: "HEAD" }, { kind: "unknown" }],
        [
            "a commit and its parent by their short hashes, as the Git extension names them",
            { scheme: "git", query: gitQuery("3f2a1b4c5d6e7f8091a2b3c4d5e6f708192a3b4c^") },
            { kind: "ref", ref: "3f2a1b4^" },
        ],
    ])("reads %s", (_case, uri, expected) => {
        expect(revisionOfDocument(uri)).toStrictEqual(expected);
    });
});

describe("isGitProvidedDocument", () => {
    it.each([
        ["git", true],
        ["gitfs", true],
        ["file", false],
        ["untitled", false],
    ])("reads a %s document as Git-provided: %s", (scheme, expected) => {
        expect(isGitProvidedDocument({ scheme })).toBe(expected);
    });
});
