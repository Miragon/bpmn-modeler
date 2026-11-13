import { compareText, type Finding } from "./finding";
import type { Evidence, FindingGroup, FindingValue } from "./fitnessFunction";
import type { FitnessReport, FunctionReport } from "./report";
import type { TrendPoint } from "./trend";

/**
 * A table row of the Markdown reports: a finding at HEAD, or one the merge base held and HEAD lacks.
 * `grown` is an existing finding whose values grew, as the changes report names it.
 */
export type FindingRow = Finding & {
    readonly status: "new" | "existing" | "grown" | "resolved";
    readonly trend?: readonly TrendPoint[];
};

const SHORT_COMMIT_LENGTH = 12;

function shortCommit(commit: string): string {
    return `\`${commit.slice(0, SHORT_COMMIT_LENGTH)}\``;
}

export function tableCell(text: string): string {
    return text.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

export function location(finding: Finding): string {
    return `\`${finding.path}:${finding.line}\``;
}

export function headLine(report: FitnessReport, headLabel?: string): string {
    const label = headLabel === undefined ? "" : ` (${headLabel})`;
    const head = report.head.uncommittedChanges
        ? `HEAD ${shortCommit(report.head.commit)}${label} with uncommitted changes`
        : `HEAD ${shortCommit(report.head.commit)}${label}`;
    return `${head} against ${shortCommit(report.base.commit)}, its merge base with \`${report.base.ref}\`.`;
}

function evidenceLine(evidence: Evidence): string {
    return evidence.kind === "published"
        ? `Published: ${evidence.reference}`
        : `Trial at ${shortCommit(evidence.commit)}: ${evidence.outcome}`;
}

function nestedList(items: readonly string[]): string[] {
    return items.map((item) => `  - ${item}`);
}

export function measuresLine(report: FunctionReport): string {
    return `- **Measures:** ${report.measures}`;
}

/** What a reader needs to judge a row: what the function misses, reports wrongly and was calibrated on. */
export function limitLines(report: FunctionReport): string[] {
    return [
        "- **Misses:**",
        ...nestedList(report.misses),
        "- **Reports wrongly:**",
        ...nestedList(report.reportsWrongly),
        "- **Evidence:**",
        ...nestedList(report.evidence.map(evidenceLine)),
    ];
}

export function baseLine(report: FunctionReport): string {
    const source =
        report.base.source === "snapshot"
            ? "stored snapshot of the merge base"
            : "run on a checkout of the merge base";
    return report.base.unmeasurable === undefined
        ? `- **Base:** ${source}`
        : `- **Base:** ${source}, not measurable there (${report.base.unmeasurable}); every finding counts as new`;
}

export function countsLine(counts: {
    readonly new: number;
    readonly existing: number;
    readonly resolved: number;
}): string {
    return `**${counts.new} new, ${counts.existing} existing, ${counts.resolved} resolved**`;
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

function trendCell(row: FindingRow, values: readonly FindingValue[]): string {
    if (row.trend === undefined) {
        return "no trend";
    }
    const { trend } = row;
    const changes = values.flatMap(({ id, title }) => {
        const series = valueSeries(id, trend);
        return series.length > 1 ? [`${title} ${series.join(" → ")}`] : [];
    });
    return changes.length === 0 ? "unchanged" : changes.join("; ");
}

function compareRank(left: FindingRow, right: FindingRow): number {
    return (
        (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER) ||
        compareText(left.path, right.path)
    );
}

export function inTableOrder<Row extends FindingRow>(rows: readonly Row[]): readonly Row[] {
    return rows.some(({ rank }) => rank !== undefined) ? [...rows].sort(compareRank) : rows;
}

/** Prints `rows` in the order given; `inTableOrder` is the report's order. */
export function findingTable(
    rows: readonly FindingRow[],
    values: readonly FindingValue[] | undefined,
): string[] {
    if (rows.length === 0) {
        return [];
    }
    const row = (finding: FindingRow) =>
        `| ${finding.status} | ${location(finding)} | ${tableCell(finding.message)} |`;
    if (values === undefined) {
        return ["", "| Status | Location | Message |", "| --- | --- | --- |", ...rows.map(row)];
    }
    return [
        "",
        "| Status | Location | Message | Trend |",
        "| --- | --- | --- | --- |",
        ...rows.map((finding) => `${row(finding)} ${tableCell(trendCell(finding, values))} |`),
    ];
}

/** `heading` is the Markdown heading prefix of an expanded group, such as `###`. */
export function groupLines(
    group: FindingGroup,
    rows: readonly FindingRow[],
    values: readonly FindingValue[] | undefined,
    heading: string,
): string[] {
    const inGroup = rows.filter((row) => row.group === group.id);
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
        : ["", `${heading} ${group.title}`, ...findingTable(inGroup, values)];
}
