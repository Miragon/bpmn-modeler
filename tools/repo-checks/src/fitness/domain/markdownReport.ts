import { compareText, type Finding } from "./finding";
import type { Evidence, FindingGroup, FindingValue } from "./fitnessFunction";
import type { FitnessReport, FunctionReport, ReportedFinding } from "./report";
import type { TrendPoint } from "./trend";

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

function valueSeries(id: string, trend: readonly TrendPoint[]): string[] {
    const series: string[] = [];
    for (const { values } of trend) {
        const value = Object.hasOwn(values, id) ? String(values[id]) : "none";
        if (series.at(-1) !== value) {
            series.push(value);
        }
    }
    return series;
}

function trendCell(finding: ReportedFinding, values: readonly FindingValue[]): string {
    if (finding.trend === undefined) {
        return "no trend";
    }
    const { trend } = finding;
    const changes = values.flatMap(({ id, title }) => {
        const series = valueSeries(id, trend);
        return series.length > 1 ? [`${title} ${series.join(" → ")}`] : [];
    });
    return changes.length === 0 ? "unchanged" : changes.join("; ");
}

function compareRank(left: ReportedFinding, right: ReportedFinding): number {
    return (
        (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        compareText(left.path, right.path)
    );
}

function inTableOrder(findings: readonly ReportedFinding[]): readonly ReportedFinding[] {
    return findings.some(({ rank }) => rank !== undefined)
        ? [...findings].sort(compareRank)
        : findings;
}

function findingTable(
    findings: readonly ReportedFinding[],
    values: readonly FindingValue[] | undefined,
): string[] {
    if (findings.length === 0) {
        return [];
    }
    const row = (finding: ReportedFinding) =>
        `| ${finding.status} | ${location(finding)} | ${tableCell(finding.message)} |`;
    if (values === undefined) {
        return [
            "",
            "| Status | Location | Message |",
            "| --- | --- | --- |",
            ...inTableOrder(findings).map(row),
        ];
    }
    return [
        "",
        "| Status | Location | Message | Trend |",
        "| --- | --- | --- | --- |",
        ...inTableOrder(findings).map(
            (finding) => `${row(finding)} ${tableCell(trendCell(finding, values))} |`,
        ),
    ];
}

function groupLines(
    group: FindingGroup,
    findings: readonly ReportedFinding[],
    values: readonly FindingValue[] | undefined,
): string[] {
    const inGroup = findings.filter((finding) => finding.group === group.id);
    if (inGroup.length === 0) {
        return [];
    }
    // GitHub renders a table inside <details> only with a blank line before it.
    return group.collapsed === true
        ? [
              "",
              "<details>",
              `<summary>${group.title} (${inGroup.length})</summary>`,
              ...findingTable(inGroup, values),
              "",
              "</details>",
          ]
        : ["", `### ${group.title}`, ...findingTable(inGroup, values)];
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
    if (report.groups === undefined) {
        lines.push(...findingTable(outcome.findings, report.values));
    } else {
        lines.push(
            ...report.groups.flatMap((group) => groupLines(group, outcome.findings, report.values)),
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
