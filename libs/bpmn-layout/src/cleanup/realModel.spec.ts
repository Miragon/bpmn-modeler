import { describe, expect, it } from "vitest";

import { parseBrokenDefinitions, parseDefinitions } from "../__fixtures__/parseBpmn";
import {
    COLLABORATION_WITH_MESSAGE_FLOW,
    DATA_ASSOCIATION_VIA_IO_SPECIFICATION,
    DATA_ASSOCIATION_WITH_MISSING_SOURCE,
    DATA_ASSOCIATION_WITH_MISSING_TARGET,
    DIAGRAM_WITH_REAL_GARBAGE,
    LANES_BOUNDARY_AND_SUBPROCESS,
} from "./__fixtures__/models";
import { findCleanupCandidates, indexModelElements, planCleanupActions } from "./rules";

/**
 * The rules against models parsed by the real `bpmn-moddle`.
 *
 * Object literals cannot express what makes this module dangerous: descriptor
 * metadata, collection-valued references and nested containment. Every
 * assertion here is about *not* deleting something valid, except the last
 * block, which keeps the detection from becoming vacuous.
 */
describe("cleanup rules on real parsed BPMN", () => {
    describe("reachability follows the moddle schema", () => {
        it("indexes elements nested under ioSpecification", async () => {
            const definitions = await parseDefinitions(DATA_ASSOCIATION_VIA_IO_SPECIFICATION);

            const index = indexModelElements(definitions);

            expect([...index.keys()]).toEqual(
                expect.arrayContaining(["IoSpec_1", "DataInput_1", "DataOutput_1", "InputSet_1"]),
            );
        });

        it("indexes elements nested in a subprocess and a lane set", async () => {
            const definitions = await parseDefinitions(LANES_BOUNDARY_AND_SUBPROCESS);

            const index = indexModelElements(definitions);

            expect([...index.keys()]).toEqual(
                expect.arrayContaining(["Lane_1", "Sub_1", "SubStart_1", "SubTask_1", "SubFlow_1"]),
            );
        });

        it("keeps diagram interchange out of the semantic index", async () => {
            const definitions = await parseDefinitions(LANES_BOUNDARY_AND_SUBPROCESS);

            const index = indexModelElements(definitions);

            expect(index.has("Diagram_1")).toBe(false);
            expect(index.has("Plane_1")).toBe(false);
        });
    });

    describe("valid models yield nothing to remove", () => {
        it.each([
            ["data associations through ioSpecification", DATA_ASSOCIATION_VIA_IO_SPECIFICATION],
            ["lanes, a boundary event and a subprocess", LANES_BOUNDARY_AND_SUBPROCESS],
            ["a collaboration with a message flow", COLLABORATION_WITH_MESSAGE_FLOW],
        ])("reports no findings for %s", async (_label, xml) => {
            const definitions = await parseDefinitions(xml);

            expect(findCleanupCandidates(definitions)).toEqual([]);
            expect(planCleanupActions(definitions)).toEqual([]);
        });

        it("never plans to remove a valid data association", async () => {
            const definitions = await parseDefinitions(DATA_ASSOCIATION_VIA_IO_SPECIFICATION);

            const removed = planCleanupActions(definitions)
                .filter((action) => action.kind === "remove-element")
                .map((action) => action.id);

            expect(removed).not.toContain("DataInputAssoc_1");
            expect(removed).not.toContain("DataOutputAssoc_1");
        });
    });

    describe("detection stays sharp", () => {
        it("flags a data association whose single-valued target is missing", async () => {
            const definitions = await parseBrokenDefinitions(DATA_ASSOCIATION_WITH_MISSING_TARGET);

            expect(findCleanupCandidates(definitions)).toEqual([
                expect.objectContaining({ kind: "dangling-flow", id: "DataInputAssoc_1" }),
            ]);
        });

        /**
         * Deliberate, not an oversight: moddle drops an unresolved reference
         * while parsing, so a collection-valued `sourceRef` that named a
         * deleted element arrives identical to one that was never written —
         * and BPMN allows a data association to declare no source at all.
         * With no way to tell the two apart, a destructive rule has to keep.
         */
        it("keeps a data association whose collection-valued source was dropped", async () => {
            const definitions = await parseBrokenDefinitions(DATA_ASSOCIATION_WITH_MISSING_SOURCE);

            expect(findCleanupCandidates(definitions)).toEqual([]);
        });

        it("flags an orphan shape and a flow to a deleted target", async () => {
            const definitions = await parseBrokenDefinitions(DIAGRAM_WITH_REAL_GARBAGE);

            const items = findCleanupCandidates(definitions);

            expect(items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ kind: "orphan-di", id: "Task_deleted_di" }),
                    expect.objectContaining({ kind: "dangling-flow", id: "Flow_orphan" }),
                ]),
            );
        });
    });
});
