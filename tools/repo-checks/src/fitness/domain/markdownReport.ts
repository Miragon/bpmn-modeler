import {
    baseLine,
    countsLine,
    findingTable,
    groupLines,
    headLine,
    inTableOrder,
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
    const newCount = outcome.findings.filter(({ status }) => status === "new").length;
    const lines = [
        countsLine({
            new: newCount,
            existing: outcome.findings.length - newCount,
            resolved: outcome.resolved.length,
        }),
    ];
    const rows = inTableOrder(outcome.findings);
    if (report.groups === undefined) {
        lines.push(...findingTable(rows, report.values));
    } else {
        lines.push(
            ...report.groups.flatMap((group) => groupLines(group, rows, report.values, "###")),
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
