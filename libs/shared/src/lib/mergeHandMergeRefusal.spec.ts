import { describe, expect, it } from "vitest";

import { handMergeRefusalNamedIds } from "./mergeHandMergeRefusal";
import type { MergePaneHandMergeRefusal } from "./mergePaneMessages";

describe("handMergeRefusalNamedIds", () => {
    it.each<[MergePaneHandMergeRefusal, readonly string[]]>([
        [{ kind: "holdsElementsOfTheirOwn", ids: ["a", "b"] }, ["a", "b"]],
        [{ kind: "namesMissingElement", ids: ["a"] }, ["a"]],
        [{ kind: "namesLeftOutElement", ids: ["a"] }, ["a"]],
        [{ kind: "changesOtherDecisions", ids: ["a"] }, ["a"]],
        [
            {
                kind: "namesWrongType",
                references: [
                    { property: "bpmn:messageRef", target: "a", expected: "bpmn:Message" },
                    { property: "bpmn:signalRef", target: "b", expected: "bpmn:Signal" },
                ],
            },
            ["a", "b"],
        ],
    ])("names the elements of %o", (refusal, ids) => {
        expect(handMergeRefusalNamedIds(refusal)).toStrictEqual(ids);
    });

    it.each<MergePaneHandMergeRefusal>([
        { kind: "conflictMarkersLeft" },
        { kind: "unparsable", detail: "x" },
        { kind: "notOneElement", found: 2 },
        { kind: "typeChanged", expected: "bpmn:Task", found: "bpmn:UserTask" },
        { kind: "idChanged", expected: "a", found: "b" },
        { kind: "beyondOwnAttributes", properties: ["bpmn:flowElements"] },
        { kind: "unknownNamespace", namespaces: ["urn:x"] },
        { kind: "rejectedByEngine", detail: "x" },
        { kind: "changesStructure", properties: ["bpmn:sourceRef"] },
        { kind: "notHandMergeable" },
    ])("names no element for $kind, whose ids are not elements to name", (refusal) => {
        expect(handMergeRefusalNamedIds(refusal)).toStrictEqual([]);
    });
});
