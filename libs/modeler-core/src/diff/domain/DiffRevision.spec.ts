import { describe, expect, it } from "vitest";

import { DiffRevision, readsHead, revisionName, scmSides } from "./DiffRevision";

const pane = (name: string, revision: DiffRevision) => ({ name, revision });
const WORKING_TREE: DiffRevision = { kind: "working-tree" };
const HEAD: DiffRevision = { kind: "ref", ref: "HEAD" };
const INDEX: DiffRevision = { kind: "index" };
const INDEX_OR_HEAD: DiffRevision = { kind: "index-or-head" };

describe("scmSides", () => {
    it.each<[string, DiffRevision, DiffRevision, [string, string]]>([
        [
            "puts the working tree after when it resolves second",
            HEAD,
            WORKING_TREE,
            ["first", "second"],
        ],
        [
            "puts the working tree after when it resolves first",
            WORKING_TREE,
            HEAD,
            ["second", "first"],
        ],
        [
            "keeps the order two commits resolved in, which tells no ancestor",
            { kind: "ref", ref: "HEAD~1" },
            HEAD,
            ["first", "second"],
        ],
        ["puts the index after a commit that resolves second", INDEX, HEAD, ["second", "first"]],
        ["puts the index after a commit that resolves first", HEAD, INDEX, ["first", "second"]],
        [
            "puts the index or HEAD after a commit that resolves second",
            INDEX_OR_HEAD,
            HEAD,
            ["second", "first"],
        ],
        [
            "puts the working tree after the index or HEAD that resolves second",
            WORKING_TREE,
            INDEX_OR_HEAD,
            ["second", "first"],
        ],
        [
            "puts the working tree after the index that resolves second",
            WORKING_TREE,
            INDEX,
            ["second", "first"],
        ],
        [
            "puts the working tree after the index that resolves first",
            INDEX,
            WORKING_TREE,
            ["first", "second"],
        ],
        [
            "puts the working tree after an unknown version",
            WORKING_TREE,
            { kind: "unknown" },
            ["second", "first"],
        ],
        [
            "keeps the order of the index and the index or HEAD",
            INDEX_OR_HEAD,
            INDEX,
            ["first", "second"],
        ],
        [
            "keeps the order of an unknown version and a commit",
            { kind: "unknown" },
            HEAD,
            ["first", "second"],
        ],
        [
            "keeps the order of a commit and an unknown version",
            HEAD,
            { kind: "unknown" },
            ["first", "second"],
        ],
        ["keeps the order of two working trees", WORKING_TREE, WORKING_TREE, ["first", "second"]],
        [
            "keeps the order of two unknown versions",
            { kind: "unknown" },
            { kind: "unknown" },
            ["first", "second"],
        ],
    ])("%s", (_case, firstRevision, secondRevision, [before, after]) => {
        const sides = scmSides(pane("first", firstRevision), pane("second", secondRevision));

        expect([sides.before.name, sides.after.name]).toStrictEqual([before, after]);
    });
});

describe("revisionName", () => {
    it.each<[string, DiffRevision, string | undefined]>([
        ["the working tree", WORKING_TREE, "Working Tree"],
        ["the index", INDEX, "Index"],
        [
            "the base of a working tree change of a file with nothing staged, which reads HEAD",
            { kind: "index-or-head", staged: false },
            "HEAD",
        ],
        [
            "the base of a working tree change of a file with staged changes, which reads the index",
            { kind: "index-or-head", staged: true },
            "Index",
        ],
        [
            "the base of a working tree change where the host cannot tell what is staged",
            INDEX_OR_HEAD,
            "Index",
        ],
        ["a symbolic ref", HEAD, "HEAD"],
        ["a branch", { kind: "ref", ref: "release/2.0" }, "release/2.0"],
        ["a commit's parent", { kind: "ref", ref: "1a2b3c4^" }, "1a2b3c4^"],
        ["a version the host does not tell", { kind: "unknown" }, undefined],
    ])("names %s as Git and VS Code's diff titles do", (_case, revision, expected) => {
        expect(revisionName(revision)).toBe(expected);
    });
});

describe("readsHead", () => {
    it.each<[string, DiffRevision, boolean]>([
        ["the ref HEAD", HEAD, true],
        [
            "a change's base of a file with nothing staged",
            { kind: "index-or-head", staged: false },
            true,
        ],
        [
            "a change's base of a file with staged changes",
            { kind: "index-or-head", staged: true },
            false,
        ],
        ["a change's base where the host cannot tell", INDEX_OR_HEAD, false],
        ["another ref", { kind: "ref", ref: "HEAD~1" }, false],
        ["the index", INDEX, false],
        ["the working tree", WORKING_TREE, false],
        ["a version the host does not tell", { kind: "unknown" }, false],
    ])("%s: %j reads HEAD → %s", (_case, revision, expected) => {
        expect(readsHead(revision)).toBe(expected);
    });
});

describe("scmSides, of a change's base", () => {
    it.each<[string, DiffRevision]>([
        ["that reads HEAD", { kind: "index-or-head", staged: false }],
        ["that reads the index", { kind: "index-or-head", staged: true }],
    ])("puts a base %s before the working tree, whichever resolves first", (_case, base) => {
        expect(scmSides(pane("tree", WORKING_TREE), pane("base", base))).toMatchObject({
            before: { name: "base" },
            after: { name: "tree" },
        });
        expect(scmSides(pane("base", base), pane("tree", WORKING_TREE))).toMatchObject({
            before: { name: "base" },
            after: { name: "tree" },
        });
    });
});
