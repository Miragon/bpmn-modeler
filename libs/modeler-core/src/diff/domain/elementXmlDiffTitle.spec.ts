import { describe, expect, it } from "vitest";

import type { DiffOrigin } from "@miragon/bpmn-modeler-types";

import { DiffRevision, DiffSideVersion } from "./DiffRevision";
import { elementXmlDiffTitle } from "./elementXmlDiffTitle";

const WORKING_TREE: DiffRevision = { kind: "working-tree" };
const INDEX: DiffRevision = { kind: "index" };
const INDEX_OR_HEAD: DiffRevision = { kind: "index-or-head" };
const UNKNOWN: DiffRevision = { kind: "unknown" };
const ref = (name: string): DiffRevision => ({ kind: "ref", ref: name });

const side = (uri: string, revision: DiffRevision): DiffSideVersion => ({ uri, revision });

describe("elementXmlDiffTitle", () => {
    it.each<[string, string, DiffOrigin, DiffSideVersion, DiffSideVersion, string]>([
        [
            "names both files of a compare",
            "Activity_1",
            "compare-files",
            side("file:///repo/a.bpmn", WORKING_TREE),
            side("file:///repo/b.bpmn", WORKING_TREE),
            "Activity_1 (XML): a.bpmn ↔ b.bpmn",
        ],
        [
            "names both files of a compare of two files with the same name",
            "Activity_1",
            "compare-files",
            side("file:///repo/v1/order.bpmn", WORKING_TREE),
            side("file:///repo/v2/order.bpmn", WORKING_TREE),
            "Activity_1 (XML): order.bpmn ↔ order.bpmn",
        ],
        [
            "names the file and both versions of an SCM diff",
            "Activity_1",
            "scm",
            side("git:/repo/order.bpmn?ref=HEAD", ref("HEAD")),
            side("file:///repo/order.bpmn", WORKING_TREE),
            "Activity_1 (XML): order.bpmn (Working Tree)",
        ],
        [
            "names only the working tree of a change in Source Control, as VS Code does",
            "Gateway_7",
            "scm",
            side("git:/repo/order.bpmn?ref=~", INDEX_OR_HEAD),
            side("file:///repo/order.bpmn", WORKING_TREE),
            "Gateway_7 (XML): order.bpmn (Working Tree)",
        ],
        [
            "names only the index of a staged change, as VS Code does",
            "Gateway_7",
            "scm",
            side("git:/repo/order.bpmn?ref=HEAD", ref("HEAD")),
            side("git:/repo/order.bpmn?ref=", INDEX),
            "Gateway_7 (XML): order.bpmn (Index)",
        ],
        [
            "names the index against the working tree",
            "Gateway_7",
            "scm",
            side("git:/repo/order.bpmn?ref=", INDEX),
            side("file:///repo/order.bpmn", WORKING_TREE),
            "Gateway_7 (XML): order.bpmn (Index) ↔ order.bpmn (Working Tree)",
        ],
        [
            "names a commit against the index",
            "Gateway_7",
            "scm",
            side("git:/repo/order.bpmn?ref=HEAD~1", ref("HEAD~1")),
            side("git:/repo/order.bpmn?ref=", INDEX),
            "Gateway_7 (XML): order.bpmn (HEAD~1) ↔ order.bpmn (Index)",
        ],
        [
            "names two commits",
            "Gateway_7",
            "scm",
            side("git:/repo/order.bpmn?ref=HEAD~1", ref("HEAD~1")),
            side("git:/repo/order.bpmn?ref=HEAD", ref("HEAD")),
            "Gateway_7 (XML): order.bpmn (HEAD~1) ↔ order.bpmn (HEAD)",
        ],
        [
            "names a commit and its parent by their short hashes, as VS Code's timeline does",
            "Gateway_7",
            "scm",
            side("git:/repo/order.bpmn?ref=x", ref("3f2a1b4c5d6e7f8091a2b3c4d5e6f708192a3b4c^")),
            side("git:/repo/order.bpmn?ref=y", ref("3f2a1b4c5d6e7f8091a2b3c4d5e6f708192a3b4c")),
            "Gateway_7 (XML): order.bpmn (3f2a1b4^) ↔ order.bpmn (3f2a1b4)",
        ],
        [
            "names the staged side of the timeline against HEAD as the index",
            "Gateway_7",
            "scm",
            side("git:/repo/order.bpmn?ref=HEAD", ref("HEAD")),
            side("git:/repo/order.bpmn?ref=~", INDEX_OR_HEAD),
            "Gateway_7 (XML): order.bpmn (Index)",
        ],
        [
            "names the file once when the host cannot name a version",
            "Task_1",
            "scm",
            side("file:///repo/order.bpmn#diff-1-before", UNKNOWN),
            side("file:///repo/order.bpmn#diff-1-after", WORKING_TREE),
            "Task_1 (XML): order.bpmn",
        ],
        [
            "names both files of an SCM diff of a renamed file",
            "Task_1",
            "scm",
            side("git:/repo/old.bpmn?ref=HEAD", ref("HEAD")),
            side("file:///repo/new.bpmn", WORKING_TREE),
            "Task_1 (XML): old.bpmn ↔ new.bpmn",
        ],
        [
            "decodes an encoded file name",
            "Task_1",
            "compare-files",
            side("file:///repo/my%20order.bpmn", WORKING_TREE),
            side("file:///repo/other.bpmn", WORKING_TREE),
            "Task_1 (XML): my order.bpmn ↔ other.bpmn",
        ],
    ])("%s", (_case, elementId, origin, before, after, expected) => {
        expect(elementXmlDiffTitle(elementId, origin, before, after)).toBe(expected);
    });
});
