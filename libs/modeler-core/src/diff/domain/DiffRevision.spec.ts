import { describe, expect, it } from "vitest";

import { DiffRevision, scmSides } from "./DiffRevision";

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
