import { describe, expect, it } from "vitest";

import { DiffRevision } from "@miragon/bpmn-modeler-core";

import { isGitProvidedDocument, isMergeSideDocument, revisionOfDocument } from "./documentRevision";

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
            "the base of a working tree change, the index or HEAD, where nothing tells what is staged",
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

describe("revisionOfDocument, of the base of a working tree change", () => {
    const base = { scheme: "git", query: gitQuery("~") };

    it.each<[string, boolean | undefined, DiffRevision]>([
        ["HEAD while the file has nothing staged", false, { kind: "index-or-head", staged: false }],
        [
            "the index once the file has staged changes",
            true,
            { kind: "index-or-head", staged: true },
        ],
        ["either where Git cannot tell", undefined, { kind: "index-or-head" }],
    ])("reads it as %s", (_case, staged, expected) => {
        expect(revisionOfDocument(base, () => staged)).toStrictEqual(expected);
    });

    it("asks for the file the Git document names, and only for that base", () => {
        const asked: string[] = [];
        const lookup = (filePath: string) => {
            asked.push(filePath);
            return false;
        };

        revisionOfDocument(base, lookup);
        revisionOfDocument({ scheme: "git", query: gitQuery("HEAD") }, lookup);
        revisionOfDocument({ scheme: "git", query: gitQuery("") }, lookup);
        revisionOfDocument({ scheme: "file", query: "" }, lookup);

        expect(asked).toStrictEqual(["/repo/order.bpmn"]);
    });

    it("reads either where the Git document names no file", () => {
        const noPath = { scheme: "git", query: JSON.stringify({ ref: "~" }) };

        expect(revisionOfDocument(noPath, () => false)).toStrictEqual({ kind: "index-or-head" });
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

describe("isMergeSideDocument", () => {
    it.each([
        ["bpmn-merge", true],
        ["git", false],
        ["file", false],
    ])("reads a %s document as a merge side: %s", (scheme, expected) => {
        expect(isMergeSideDocument({ scheme })).toBe(expected);
    });
});
