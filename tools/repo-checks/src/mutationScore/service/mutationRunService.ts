import { MUTATED_WORKSPACE_DIR, type MutationRun } from "../domain/mutationRun";
import { mutationSummaryMarkdown } from "../domain/mutationSummary";
import { contextTallies, mutationRunFromStrykerReport } from "../domain/strykerReport";
import type { MutationRunWriter } from "../port/MutationRunWriter";
import type { StrykerReports } from "../port/StrykerReports";

export interface RecordedRun {
    readonly reportPath: string;
    readonly commit: string;
    readonly runId: string;
}

export function recordMutationRun(
    reports: StrykerReports,
    writer: MutationRunWriter,
    { reportPath, commit, runId }: RecordedRun,
): MutationRun {
    const report = reports.read(reportPath);
    if (report === undefined) {
        throw new Error(`no Stryker report at ${reportPath}`);
    }
    const run = mutationRunFromStrykerReport(report, MUTATED_WORKSPACE_DIR, commit, runId);
    writer.write(run);
    return run;
}

/** A run that failed before Stryker wrote its report still gets a summary that says so. */
export function summarizeMutationReport(reports: StrykerReports, reportPath: string): string {
    const report = reports.read(reportPath);
    return report === undefined
        ? `No mutation report at \`${reportPath}\`.\n`
        : mutationSummaryMarkdown(MUTATED_WORKSPACE_DIR, contextTallies(report));
}
