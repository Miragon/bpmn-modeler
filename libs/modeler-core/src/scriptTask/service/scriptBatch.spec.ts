import { describe, expect, it, type Mock, vi } from "vitest";

import type { ScriptTaskScript } from "@miragon/bpmn-modeler-types";

import { materializeScriptBatch, scriptBatchSummary } from "./scriptBatch";

type MaterializeResult = { written: boolean } | undefined;
type Materialize = (script: ScriptTaskScript) => Promise<MaterializeResult>;

function script(elementId: string): ScriptTaskScript {
    return { elementId, scriptFormat: "javascript", content: `// ${elementId}` };
}

function materializedIds(materialize: Mock<Materialize>): string[] {
    return materialize.mock.calls.map(([materialized]) => materialized.elementId);
}

const flushPendingWork = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("materializeScriptBatch", () => {
    it("reports nothing generated for a diagram without inline scripts", async () => {
        const materialize = vi.fn<Materialize>();

        const outcome = await materializeScriptBatch([], materialize);

        expect(outcome).toEqual({ generated: 0, alreadyOpen: 0 });
        expect(materialize).not.toHaveBeenCalled();
    });

    it("counts written and already-open scripts and skips cancelled ones", async () => {
        const materialize = vi
            .fn<Materialize>()
            .mockResolvedValueOnce({ written: true })
            .mockResolvedValueOnce({ written: false })
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({ written: true });

        const outcome = await materializeScriptBatch(
            [script("A"), script("B"), script("C"), script("D")],
            materialize,
        );

        expect(outcome).toEqual({ generated: 2, alreadyOpen: 1 });
        expect(materializedIds(materialize)).toEqual(["A", "B", "C", "D"]);
    });

    it("materialises the next script only once the previous one has settled", async () => {
        let finishFirst!: (result: MaterializeResult) => void;
        const materialize = vi
            .fn<Materialize>()
            .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
            .mockResolvedValue({ written: true });

        const batch = materializeScriptBatch([script("A"), script("B")], materialize);
        await flushPendingWork();

        expect(materializedIds(materialize)).toEqual(["A"]);

        finishFirst({ written: true });
        await expect(batch).resolves.toEqual({ generated: 2, alreadyOpen: 0 });
        expect(materializedIds(materialize)).toEqual(["A", "B"]);
    });

    it("aborts the remaining scripts when one fails to materialise", async () => {
        const materialize = vi
            .fn<Materialize>()
            .mockResolvedValueOnce({ written: true })
            .mockRejectedValueOnce(new Error("disk full"))
            .mockResolvedValue({ written: true });

        await expect(
            materializeScriptBatch([script("A"), script("B"), script("C")], materialize),
        ).rejects.toThrow("disk full");
        expect(materializedIds(materialize)).toEqual(["A", "B"]);
    });
});

describe("scriptBatchSummary", () => {
    it("names the output folder", () => {
        expect(scriptBatchSummary({ generated: 2, alreadyOpen: 0 }, ".camunda/tmp/scripting")).toBe(
            "Generated 2 script file(s) in .camunda/tmp/scripting — open a file to edit it with live sync into the diagram.",
        );
    });

    it("mentions scripts left untouched because they were already open", () => {
        expect(scriptBatchSummary({ generated: 1, alreadyOpen: 3 }, "scripts")).toBe(
            "Generated 1 script file(s) in scripts (3 already open, left untouched) — open a file to edit it with live sync into the diagram.",
        );
    });
});
