import { describe, expect, it } from "vitest";

import { PlannedWrite } from "./MigrationPlan";
import { migrationSummary, WriteResult } from "./migrationSummary";

const updatedC7: WriteResult = {
    kind: "updated",
    write: new PlannedWrite("/work/c7.bpmn", "c7", "7.24.0"),
};
const updatedC8 = (path: string): WriteResult => ({
    kind: "updated",
    write: new PlannedWrite(path, "c8", "8.8.0"),
});
const unchanged: WriteResult = { kind: "unchanged" };
const skipped: WriteResult = { kind: "skipped" };

describe("migrationSummary", () => {
    it.each([
        {
            run: "no diagram",
            results: [],
            expected: "All diagrams are already at the selected version.",
        },
        {
            run: "only diagrams already at the version",
            results: [unchanged, unchanged],
            expected: "All diagrams are already at the selected version.",
        },
        {
            run: "updated diagrams of one engine",
            results: [updatedC8("/work/a.bpmn"), unchanged, updatedC8("/work/b.bpmn")],
            expected: "Updated 2 diagram(s) to Camunda 8 (8.8.0).",
        },
        {
            run: "updated diagrams of both engines",
            results: [updatedC7, updatedC8("/work/a.bpmn")],
            expected:
                "Updated 1 diagram(s) to Camunda 7 (7.24.0) and 1 diagram(s) to Camunda 8 (8.8.0).",
        },
        {
            run: "updated diagrams in the order their engines were migrated",
            results: [updatedC8("/work/a.bpmn"), updatedC7, updatedC8("/work/b.bpmn")],
            expected:
                "Updated 2 diagram(s) to Camunda 8 (8.8.0) and 1 diagram(s) to Camunda 7 (7.24.0).",
        },
        {
            run: "only skipped diagrams",
            results: [skipped, unchanged],
            expected: "No diagrams were updated. Skipped 1 diagram(s); see the log for details.",
        },
        {
            run: "updated and skipped diagrams",
            results: [skipped, updatedC8("/work/a.bpmn"), unchanged, skipped],
            expected:
                "Updated 1 diagram(s) to Camunda 8 (8.8.0). Skipped 2 diagram(s); see the log for details.",
        },
    ] satisfies { run: string; results: WriteResult[]; expected: string }[])(
        "summarises $run",
        ({ results, expected }) => {
            expect(migrationSummary(results)).toBe(expected);
        },
    );
});
