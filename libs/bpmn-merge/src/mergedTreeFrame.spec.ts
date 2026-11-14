import { describe, expect, it } from "vitest";

import { type DocumentFrame, mergeFrames } from "./mergedTreeFrame";

const frame = (
    attributes: Record<string, string>,
    contents: Partial<Pick<DocumentFrame, "extensionElements" | "imports">> = {},
): DocumentFrame => ({ attributes, extensionElements: "", imports: "", ...contents });

const BASE = frame({ "exporterVersion": "5.40.0", "custom:team": "billing" });

describe("mergeFrames", () => {
    it.each([
        {
            rule: "takes incoming's value of an attribute only incoming changed",
            current: BASE,
            incoming: frame({ "exporterVersion": "5.41.0", "custom:team": "billing" }),
            taken: { exporterVersion: "5.41.0" },
            notes: [],
        },
        {
            rule: "takes incoming's removal of an attribute only incoming changed",
            current: BASE,
            incoming: frame({ exporterVersion: "5.40.0" }),
            taken: { "custom:team": undefined },
            notes: [],
        },
        {
            rule: "takes an attribute only incoming adds",
            current: BASE,
            incoming: frame({ ...BASE.attributes, "custom:owner": "shop" }),
            taken: { "custom:owner": "shop" },
            notes: [],
        },
        {
            rule: "keeps current's value of an attribute only current changed",
            current: frame({ "exporterVersion": "5.41.0", "custom:team": "billing" }),
            incoming: BASE,
            taken: {},
            notes: [],
        },
        {
            rule: "keeps a change both sides made alike",
            current: frame({ "exporterVersion": "5.41.0", "custom:team": "billing" }),
            incoming: frame({ "exporterVersion": "5.41.0", "custom:team": "billing" }),
            taken: {},
            notes: [],
        },
        {
            rule: "keeps current's value and names an attribute both changed differently",
            current: frame({ "exporterVersion": "5.41.0", "custom:team": "billing" }),
            incoming: frame({ "exporterVersion": "5.42.0", "custom:team": "billing" }),
            taken: {},
            notes: [{ kind: "frameDiffers", attribute: "exporterVersion" }],
        },
        {
            rule: "keeps current's extension elements and names incoming's change of them",
            current: BASE,
            incoming: frame(BASE.attributes, { extensionElements: "<custom:meta />" }),
            taken: {},
            notes: [{ kind: "frameDiffers", attribute: "extensionElements" }],
        },
        {
            rule: "keeps current's imports and names incoming's change of them",
            current: frame(BASE.attributes, { imports: "<bpmn:import />" }),
            incoming: frame(BASE.attributes, { imports: "<bpmn:import /><bpmn:import />" }),
            taken: {},
            notes: [{ kind: "frameDiffers", attribute: "imports" }],
        },
        {
            rule: "says nothing of extension elements only current changed",
            current: frame(BASE.attributes, { extensionElements: "<custom:meta />" }),
            incoming: BASE,
            taken: {},
            notes: [],
        },
    ] as const)("$rule", ({ current, incoming, taken, notes }) => {
        expect(mergeFrames({ base: BASE, current, incoming })).toEqual({
            takenFromIncoming: taken,
            notes,
        });
    });

    it("without a base, keeps current's frame and names everything incoming sets differently", () => {
        const incoming = frame(
            { "exporterVersion": "5.41.0", "custom:team": "billing" },
            { imports: "<bpmn:import />" },
        );

        expect(mergeFrames({ current: BASE, incoming })).toEqual({
            takenFromIncoming: {},
            notes: [
                { kind: "frameDiffers", attribute: "exporterVersion" },
                { kind: "frameDiffers", attribute: "imports" },
            ],
        });
    });
});
