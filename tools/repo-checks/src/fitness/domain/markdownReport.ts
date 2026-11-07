import {
    baseLine,
    countsLine,
    findingTable,
    groupLines,
    headLine,
    limitLines,
    location,
    measuresLine,
    tableCell,
} from "./markdownBlocks";
import type { FitnessReport, FunctionReport } from "./report";

function outcomeLines(report: FunctionReport): string[] {
    const { outcome } = report;
    if (outcome.kind === "unmeasurable") {
        return [`Not measurable at HEAD: ${outcome.reason}`];
    }
    const lines = [countsLine(outcome.findings, outcome.resolved.length)];
    if (report.groups === undefined) {
        lines.push(...findingTable(outcome.findings, report.values));
    } else {
        lines.push(
            ...report.groups.flatMap((group) =>
                groupLines(group, outcome.findings, report.values, "###"),
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
        measuresLine(report),
        `- **Relies on:** ${reliesOn.rule} (skill \`${reliesOn.skill}\`)`,
        ...limitLines(report),
        baseLine(report),
        "",
        ...outcomeLines(report),
    ];
}

export function markdownReport(report: FitnessReport): string {
    const sections =
        report.functions.length === 0
            ? [["No fitness function is registered."]]
            : report.functions.map(functionSection);
    return `${[
        "# Fitness function report",
        "",
        headLine(report),
        ...sections.flatMap((section) => ["", ...section]),
    ].join("\n")}\n`;
}
