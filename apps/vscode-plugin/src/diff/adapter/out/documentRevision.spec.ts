import { describe, expect, it } from "vitest";

import { DiffRevision } from "@miragon/bpmn-modeler-core";

import { revisionOfDocument } from "./documentRevision";

const gitQuery = (ref: string) => JSON.stringify({ path: "/repo/order.bpmn", ref });

describe("revisionOfDocument", () => {
    it.each<[string, { scheme: string; query: string }, DiffRevision]>([
        ["a file as the working tree", { scheme: "file", query: "" }, { kind: "working-tree" }],
        ["a Git document at a commit", { scheme: "git", query: gitQuery("HEAD") }, { kind: "ref", ref: "HEAD" }],
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
        ["a Git document whose query names no ref", { scheme: "git", query: "{}" }, { kind: "unknown" }],
        ["a Git document whose query is no JSON", { scheme: "git", query: "HEAD" }, { kind: "unknown" }],
        ["a document of another provider", { scheme: "gitfs", query: "HEAD" }, { kind: "unknown" }],
    ])("reads %s", (_case, uri, expected) => {
        expect(revisionOfDocument(uri)).toStrictEqual(expected);
    });
});
