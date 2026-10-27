import { describe, expect, it, type Mock, vi } from "vitest";

import type { ScriptTaskScript } from "@miragon/bpmn-modeler-types";

import { RecordingNotifier } from "../../testing";
import type { ScriptMaterialization } from "../domain/scriptBatchSummary";
import { materializeScriptBatch } from "./scriptBatch";

type Materialize = (script: ScriptTaskScript) => Promise<ScriptMaterialization>;

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

        const outcome = await materializeScriptBatch([], materialize, new RecordingNotifier());

        expect(outcome).toEqual({ generated: 0, alreadyOpen: 0, failed: 0 });
        expect(materialize).not.toHaveBeenCalled();
    });

    it("counts written and already-open scripts and skips cancelled ones", async () => {
        const materialize = vi
            .fn<Materialize>()
            .mockResolvedValueOnce({ kind: "written" })
            .mockResolvedValueOnce({ kind: "alreadyOpen" })
            .mockResolvedValueOnce({ kind: "cancelled" })
            .mockResolvedValueOnce({ kind: "written" });

        const outcome = await materializeScriptBatch(
            [script("A"), script("B"), script("C"), script("D")],
            materialize,
            new RecordingNotifier(),
        );

        expect(outcome).toEqual({ generated: 2, alreadyOpen: 1, failed: 0 });
        expect(materializedIds(materialize)).toEqual(["A", "B", "C", "D"]);
    });

    it("materialises the next script only once the previous one has settled", async () => {
        let finishFirst!: (result: ScriptMaterialization) => void;
        const materialize = vi
            .fn<Materialize>()
            .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
            .mockResolvedValue({ kind: "written" });

        const batch = materializeScriptBatch(
            [script("A"), script("B")],
            materialize,
            new RecordingNotifier(),
        );
        await flushPendingWork();

        expect(materializedIds(materialize)).toEqual(["A"]);

        finishFirst({ kind: "written" });
        await expect(batch).resolves.toEqual({ generated: 2, alreadyOpen: 0, failed: 0 });
        expect(materializedIds(materialize)).toEqual(["A", "B"]);
    });

    it("counts a failed script and keeps materialising the rest", async () => {
        const materialize = vi
            .fn<Materialize>()
            .mockResolvedValueOnce({ kind: "written" })
            .mockRejectedValueOnce(new Error("disk full"))
            .mockRejectedValueOnce(new Error("read-only"))
            .mockResolvedValueOnce({ kind: "written" });

        await expect(
            materializeScriptBatch(
                [script("A"), script("B"), script("C"), script("D")],
                materialize,
                new RecordingNotifier(),
            ),
        ).resolves.toEqual({ generated: 2, alreadyOpen: 0, failed: 2 });
        expect(materializedIds(materialize)).toEqual(["A", "B", "C", "D"]);
    });

    it("logs which script failed and why", async () => {
        const logger = new RecordingNotifier();
        const materialize = vi
            .fn<Materialize>()
            .mockRejectedValueOnce(new Error("disk full"))
            .mockRejectedValueOnce(new Error("read-only"));

        await materializeScriptBatch([script("A"), script("B")], materialize, logger);

        expect(logger.logged("error")).toEqual([
            expect.stringMatching(/^Could not write the script file of A: Error: disk full/),
            expect.stringMatching(/^Could not write the script file of B: Error: read-only/),
        ]);
    });
});
