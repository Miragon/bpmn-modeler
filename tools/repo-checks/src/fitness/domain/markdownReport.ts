import type { Finding } from "./finding";
import type { Evidence } from "./fitnessFunction";
import type { FitnessReport, FunctionReport } from "./report";

const SHORT_COMMIT_LENGTH = 12;

function shortCommit(commit: string): string {
    return `\`${commit.slice(0, SHORT_COMMIT_LENGTH)}\``;
}

function tableCell(text: string): string {
    return text.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function location(finding: Finding): string {
    return `\`${finding.path}:${finding.line}\``;
}

function evidenceLine(evidence: Evidence): string {
    return evidence.kind === "published"
        ? `Published: ${evidence.reference}`
        : `Trial at ${shortCommit(evidence.commit)}: ${evidence.outcome}`;
}

function nestedList(items: readonly string[]): string[] {
    return items.map((item) => `  - ${item}`);
}

function baseLine(report: FunctionReport): string {
    const source =
        report.base.source === "snapshot"
            ? "stored snapshot of the merge base"
            : "run on a checkout of the merge base";
    return report.base.unmeasurable === undefined
        ? `- **Base:** ${source}`
        : `- **Base:** ${source}, not measurable there (${report.base.unmeasurable}); every finding counts as new`;
}

function outcomeLines(report: FunctionReport): string[] {
    const { outcome } = report;
    if (outcome.kind === "unmeasurable") {
        return [`Not measurable at HEAD: ${outcome.reason}`];
    }
    const newCount = outcome.findings.filter(({ status }) => status === "new").length;
    const lines = [
        `**${newCount} new, ${outcome.findings.length - newCount} existing, ${outcome.resolved.length} resolved**`,
    ];
    if (outcome.findings.length > 0) {
        lines.push(
            "",
            "| Status | Location | Message |",
            "| --- | --- | --- |",
            ...outcome.findings.map(
                (finding) =>
                    `| ${finding.status} | ${location(finding)} | ${tableCell(finding.message)} |`,
            ),
        );
    }
    if (outcome.resolved.length > 0) {
        lines.push(
            "",
            "Resolved since the merge base:",
            "",
            ...outcome.resolved.map(
                (finding) => `- ${location(finding)} ${tableCell(finding.message)}`,
            ),
        );
    }
    return lines;
}

function functionSection(report: FunctionReport): string[] {
    const { categories, reliesOn } = report;
    return [
        `## \`${report.id}\` version ${report.version}`,
        "",
        `- **Categories:** ${categories.scope}, ${categories.cadence}, ${categories.result}`,
        `- **Measures:** ${report.measures}`,
        `- **Relies on:** ${reliesOn.rule} (skill \`${reliesOn.skill}\`)`,
        "- **Misses:**",
        ...nestedList(report.misses),
        "- **Reports wrongly:**",
        ...nestedList(report.reportsWrongly),
        "- **Evidence:**",
        ...nestedList(report.evidence.map(evidenceLine)),
        baseLine(report),
        "",
        ...outcomeLines(report),
    ];
}

export function markdownReport(report: FitnessReport): string {
    const head = report.head.uncommittedChanges
        ? `HEAD ${shortCommit(report.head.commit)} with uncommitted changes`
        : `HEAD ${shortCommit(report.head.commit)}`;
    const sections =
        report.functions.length === 0
            ? [["No fitness function is registered."]]
            : report.functions.map(functionSection);
    return `${[
        "# Fitness function report",
        "",
        `${head} against ${shortCommit(report.base.commit)}, its merge base with \`${report.base.ref}\`.`,
        ...sections.flatMap((section) => ["", ...section]),
    ].join("\n")}\n`;
}
