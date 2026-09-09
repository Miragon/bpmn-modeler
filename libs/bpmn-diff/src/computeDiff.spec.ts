import { describe, expect, it } from "vitest";

import { computeDiff } from "./computeDiff";
import { sideView } from "./sideView";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "./__fixtures__/mock-diff";
import { ALL_EXECUTION_PROPERTY_FIXTURES } from "./__fixtures__/execution-properties";

describe("computeDiff", () => {
    it.each(ALL_EXECUTION_PROPERTY_FIXTURES)("compares $name", async (fixture) => {
        await expect(computeDiff(fixture.before, fixture.after)).resolves.toEqual(fixture.expected);
    });

    it("sorts each of the four categories into their expected ids", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        expect(result.added).toContain("Gateway_1");
        expect(result.removed).toContain("UserTask_ToRemove");
        expect(result.changed).toContain("ServiceTask_1");
        expect(result.layoutChanged).toContain("ServiceTask_2");
    });

    it("reports counts matching the category array lengths", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        expect(result.counts).toEqual({
            added: result.added.length,
            removed: result.removed.length,
            changed: result.changed.length,
            layoutChanged: result.layoutChanged.length,
        });
    });

    it("orders navigationOrder by sequence-flow position (start → end)", async () => {
        const { navigationOrder } = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);
        const at = (id: string) => navigationOrder.indexOf(id);

        // ServiceTask_1 (changed) is upstream of Gateway_1 (added), which is
        // upstream of ServiceTask_2 (layoutChanged).
        expect(at("ServiceTask_1")).toBeGreaterThanOrEqual(0);
        expect(at("ServiceTask_1")).toBeLessThan(at("Gateway_1"));
        expect(at("Gateway_1")).toBeLessThan(at("ServiceTask_2"));
    });

    it("anchors removed elements next to their surviving neighbour", async () => {
        const { navigationOrder } = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);
        const at = (id: string) => navigationOrder.indexOf(id);

        // UserTask_ToRemove followed ServiceTask_1 in the before diagram, so it
        // anchors right after ServiceTask_1 — ahead of Gateway_1, not dumped
        // at the end.
        expect(at("UserTask_ToRemove")).toBeGreaterThan(at("ServiceTask_1"));
        expect(at("UserTask_ToRemove")).toBeLessThan(at("Gateway_1"));
    });

    it("de-duplicates navigationOrder across categories", async () => {
        const { navigationOrder } = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        expect(new Set(navigationOrder).size).toBe(navigationOrder.length);
    });

    it("returns a value that survives a JSON round-trip unchanged", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it("rejects on invalid XML instead of returning a partial result", async () => {
        await expect(computeDiff("this is not xml", MOCK_DIFF_AFTER_XML)).rejects.toThrow();
    });

    it("rejects when a descriptor failure makes the parser skip XML content", async () => {
        const invalidDescriptorContent = MOCK_DIFF_BEFORE_XML.replace(
            "</bpmn:serviceTask>",
            "<bpmn:extensionElements><camunda:Unknown /></bpmn:extensionElements></bpmn:serviceTask>",
        );

        await expect(computeDiff(invalidDescriptorContent, MOCK_DIFF_AFTER_XML)).rejects.toThrow(
            /unparsable content/i,
        );
    });
});

describe("sideView", () => {
    it("blanks added on the before side and removed on the after side", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        const before = sideView(result, "before");
        expect(before.added).toEqual([]);
        expect(before.removed).toEqual(result.removed);

        const after = sideView(result, "after");
        expect(after.added).toEqual(result.added);
        expect(after.removed).toEqual([]);
    });

    it("passes changed and layoutChanged through to both sides", async () => {
        const result = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);

        for (const side of ["before", "after"] as const) {
            const view = sideView(result, side);
            expect(view.changed).toEqual(result.changed);
            expect(view.layoutChanged).toEqual(result.layoutChanged);
        }
    });
});
