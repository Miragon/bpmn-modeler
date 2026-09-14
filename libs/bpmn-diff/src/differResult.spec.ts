import { describe, expect, it } from "vitest";

import { assertDiffResultShape, categoryIds, runDiff } from "./differResult";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "./__fixtures__/mock-diff";

type ModdleFactory = () => { fromXML(xml: string): Promise<{ rootElement: unknown }> };

async function parse(xml: string): Promise<unknown> {
    const mod = (await import("bpmn-moddle")) as unknown as {
        default?: ModdleFactory;
        BpmnModdle?: ModdleFactory;
    };
    const createBpmnModdle = mod.default ?? mod.BpmnModdle;
    if (!createBpmnModdle) throw new Error("bpmn-moddle exposed no factory");
    const { rootElement } = await createBpmnModdle().fromXML(xml);
    return rootElement;
}

describe("runDiff (bpmn-js-differ shape pin)", () => {
    it("does not throw and reports the expected ids for the installed differ", async () => {
        const before = await parse(MOCK_DIFF_BEFORE_XML);
        const after = await parse(MOCK_DIFF_AFTER_XML);

        const result = runDiff(before, after);

        expect(categoryIds([result], "added")).toContain("Gateway_1");
        expect(categoryIds([result], "removed")).toContain("UserTask_ToRemove");
        expect(categoryIds([result], "layoutChanged")).toContain("ServiceTask_2");
    });
});

describe("assertDiffResultShape", () => {
    it("accepts a fully-shaped result", () => {
        expect(() =>
            assertDiffResultShape({
                _added: {},
                _removed: {},
                _changed: {},
                _layoutChanged: {},
            }),
        ).not.toThrow();
    });

    it.each([
        ["empty object", {}],
        ["partial result", { _added: {}, _removed: {} }],
        ["null", null],
        ["array-valued category", { _added: [], _removed: {}, _changed: {}, _layoutChanged: {} }],
    ])("throws on %s", (_label, value) => {
        expect(() => assertDiffResultShape(value)).toThrow(/bpmn-js-differ/);
    });
});
