import { describe, expect, it } from "vitest";

import { type MergeRemovedWith, removedWithElement } from "./mergeRemovedWith";

describe("removedWithElement", () => {
    it.each<[string, readonly string[], readonly string[] | undefined, MergeRemovedWith]>([
        ["one flow", ["Flow_1"], undefined, { wording: "oneFlow", elements: ["Flow_1"] }],
        [
            "several flows",
            ["Flow_1", "Flow_2"],
            undefined,
            { wording: "flows", elements: ["Flow_1", "Flow_2"] },
        ],
        [
            "several flows with an empty list of boundary events",
            ["Flow_1", "Flow_2"],
            [],
            { wording: "flows", elements: ["Flow_1", "Flow_2"] },
        ],
        [
            "one flow with an empty list of boundary events",
            ["Flow_1"],
            [],
            { wording: "oneFlow", elements: ["Flow_1"] },
        ],
        [
            "a boundary event alone",
            [],
            ["Timer_1"],
            { wording: "boundaryEvent", elements: ["Timer_1"] },
        ],
        [
            "boundary events and flows, boundary events first",
            ["Flow_1"],
            ["Timer_1"],
            { wording: "elements", elements: ["Timer_1", "Flow_1"] },
        ],
        [
            "two boundary events",
            [],
            ["Timer_1", "Error_1"],
            { wording: "elements", elements: ["Timer_1", "Error_1"] },
        ],
    ])("names %s", (_case, connections, boundaryEvents, removedWith) => {
        expect(removedWithElement(connections, boundaryEvents)).toStrictEqual(removedWith);
    });
});
