import { describe, expect, it } from "vitest";
import {
    handMergeRefusalNamedIds,
    type MergePaneHandMergeRefusal,
} from "@miragon/bpmn-modeler-shared";

import { handMergeRefusalDetail } from "./mergeHandMergeTexts";

const REFUSALS: Record<MergePaneHandMergeRefusal["kind"], MergePaneHandMergeRefusal> = {
    conflictMarkersLeft: { kind: "conflictMarkersLeft" },
    unparsable: { kind: "unparsable", detail: "x" },
    notOneElement: { kind: "notOneElement", found: 2 },
    typeChanged: { kind: "typeChanged", expected: "bpmn:Task", found: "bpmn:UserTask" },
    idChanged: { kind: "idChanged", expected: "Task_1", found: "Task_2" },
    holdsElementsOfTheirOwn: { kind: "holdsElementsOfTheirOwn", ids: ["Task_1", "Task_2"] },
    beyondOwnAttributes: { kind: "beyondOwnAttributes", properties: ["bpmn:flowElements"] },
    namesWrongType: {
        kind: "namesWrongType",
        references: [{ property: "bpmn:messageRef", target: "Task_1", expected: "bpmn:Message" }],
    },
    unknownNamespace: { kind: "unknownNamespace", namespaces: ["urn:x"] },
    rejectedByEngine: { kind: "rejectedByEngine", detail: "x" },
    changesStructure: { kind: "changesStructure", properties: ["bpmn:sourceRef"] },
    namesMissingElement: { kind: "namesMissingElement", ids: ["Task_1"] },
    namesLeftOutElement: { kind: "namesLeftOutElement", ids: ["Task_1"] },
    changesOtherDecisions: { kind: "changesOtherDecisions", ids: ["Task_1"] },
    notHandMergeable: { kind: "notHandMergeable" },
};

describe("handMergeRefusalDetail", () => {
    it.each(Object.values(REFUSALS))(
        "names by the pane's names exactly the elements the host named for $kind",
        (refusal) => {
            const named: string[] = [];
            handMergeRefusalDetail(
                refusal,
                (id) => {
                    named.push(id);
                    return id;
                },
                (key) => key,
            );

            expect(named).toStrictEqual(handMergeRefusalNamedIds(refusal));
        },
    );
});
