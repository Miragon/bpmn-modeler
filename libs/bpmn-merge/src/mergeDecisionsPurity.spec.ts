import { afterEach, describe, expect, it, vi } from "vitest";

const PARSER_MODULES = ["@miragon/bpmn-modeler-diff", "bpmn-moddle", "saxen"];

describe("MergeDecisions", () => {
    afterEach(() => {
        for (const parserModule of PARSER_MODULES) {
            vi.doUnmock(parserModule);
        }
        vi.resetModules();
    });

    it("loads without the parser", async () => {
        vi.resetModules();
        for (const parserModule of PARSER_MODULES) {
            vi.doMock(parserModule, () => {
                throw new Error(`the decisions loaded ${parserModule}`);
            });
        }

        const { MergeDecisions } = await import("./mergeDecisions");

        expect(MergeDecisions.from({ hasBase: true, elements: [] }).canBuild).toBe(true);
    });
});
