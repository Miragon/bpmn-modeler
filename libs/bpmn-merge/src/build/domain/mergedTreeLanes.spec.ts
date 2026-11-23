import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult } from "../../__fixtures__/mergeResultBuilder";
import { laneMembersOf } from "./mergedTreeLanes";
import type { MergeResolution } from "../../decide/domain/mergeDecisions";

const LANE = { type: "bpmn:Lane" };

function membersAsArrays(members: ReadonlyMap<string, ReadonlySet<string>>) {
    return Object.fromEntries([...members].map(([lane, nodes]) => [lane, [...nodes]]));
}

describe("laneMembersOf", () => {
    it("lists each node in the lanes of the version its side gives", () => {
        const result = mergeResult(
            mergeElement("Lane_A", "unchanged", LANE),
            mergeElement("Lane_B", "unchanged", LANE),
            mergeElement("Task_Moved", "takenFromIncoming", {
                current: { lanes: ["Lane_A"] },
                incoming: { lanes: ["Lane_B"] },
            }),
            mergeElement("Task_Kept", "unchanged", { lanes: ["Lane_A"] }),
        );
        const resolution: MergeResolution = {
            elements: {
                Lane_A: "current",
                Lane_B: "current",
                Task_Moved: "incoming",
                Task_Kept: "current",
            },
            layout: {},
            appendedLanes: [],
        };

        expect(membersAsArrays(laneMembersOf(result, resolution))).toEqual({
            Lane_A: ["Task_Kept"],
            Lane_B: ["Task_Moved"],
        });
    });

    it("leaves out nodes and lanes that are not in the result", () => {
        const result = mergeResult(
            mergeElement("Lane_A", "unchanged", LANE),
            mergeElement("Lane_Gone", "removedByIncoming", LANE),
            mergeElement("Task_Gone", "removedByIncoming", { lanes: ["Lane_A"] }),
            mergeElement("Task_Kept", "unchanged", { lanes: ["Lane_A", "Lane_Gone"] }),
        );
        const resolution: MergeResolution = {
            elements: {
                Lane_A: "current",
                Lane_Gone: "incoming",
                Task_Gone: "incoming",
                Task_Kept: "current",
            },
            layout: {},
            appendedLanes: [],
        };

        expect(membersAsArrays(laneMembersOf(result, resolution))).toEqual({
            Lane_A: ["Task_Kept"],
        });
    });

    it("gives a lane without nodes an empty membership", () => {
        const result = mergeResult(mergeElement("Lane_Empty", "addedByIncoming", LANE));
        const resolution: MergeResolution = {
            elements: { Lane_Empty: "incoming" },
            layout: {},
            appendedLanes: [],
        };

        expect(membersAsArrays(laneMembersOf(result, resolution))).toEqual({ Lane_Empty: [] });
    });
});
