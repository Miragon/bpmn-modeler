import { grewSinceBase } from "./delta";
import type { Finding } from "./finding";
import type { FindingGroup, FindingValue } from "./fitnessFunction";
import {
    baseLine,
    countsLine,
    type FindingRow,
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

export interface ChangesReportOptions {
    /** Says what HEAD is, such as the merge commit a CI run measures. */
    readonly headLabel?: string;
    /**
     * Leaves out rows, then the declarations, until the text fits; below the length of the note
     * that nothing fits, that note is returned anyway.
     */
    readonly maxCharacters?: number;
}

function inFullReportOnly({ changesView }: FunctionReport): boolean {
    return changesView === "full-report-only";
}

/** Its findings at the merge base drop out of the delta without being resolved. */
function measuredOnlyAtBase({ base, outcome }: FunctionReport): boolean {
    return outcome.kind === "unmeasurable" && base.unmeasurable === undefined;
}

/**
 * A CI job reads whether anything changed from this first line, so it stays fixed. Rows that are
 * only counted, such as added files, are no change: they alone would post a comment.
 */
function changesMarker(report: FitnessReport, changed: readonly FunctionChanges[]): string {
    const listsRows = changed.some(({ rows }) => rows.length > 0);
    const blinded = report.functions.some(
        (functionReport) => !inFullReportOnly(functionReport) && measuredOnlyAtBase(functionReport),
    );
    return listsRows || blinded
        ? "<!-- fitness-changes: some -->"
        : "<!-- fitness-changes: none -->";
}

const TITLE = "## Fitness function changes";

interface FunctionChanges {
    readonly report: FunctionReport;
    readonly counts: { readonly new: number; readonly existing: number; readonly resolved: number };
    /** In the order they are kept: new rows first, then resolved ones, each in group and table order. */
    readonly rows: readonly FindingRow[];
    /** Lines that count the rows the view does not list. */
    readonly notListed: readonly string[];
}

interface Limits {
    readonly rowsPerFunction: number;
    readonly withDeclarations: boolean;
}

const UNLIMITED: Limits = { rowsPerFunction: Number.POSITIVE_INFINITY, withDeclarations: true };

function inGroupOrder(
    rows: readonly FindingRow[],
    groups: readonly FindingGroup[] | undefined,
): readonly FindingRow[] {
    const ordered = inTableOrder(rows);
    if (groups === undefined) {
        return ordered;
    }
    const groupIndex = (row: FindingRow) => {
        const index = groups.findIndex(({ id }) => id === row.group);
        return index === -1 ? groups.length : index;
    };
    return [...ordered].sort((left, right) => groupIndex(left) - groupIndex(right));
}

function rowCount(count: number): string {
    return count === 1 ? "1 row" : `${count} rows`;
}

function largestOf(findings: readonly Finding[], { id }: FindingValue): Finding {
    const valueOf = ({ values }: Finding) => values?.[id] ?? Number.NEGATIVE_INFINITY;
    return findings.reduce((largest, finding) =>
        valueOf(finding) > valueOf(largest) ? finding : largest,
    );
}

function notListedLines(
    added: readonly Finding[],
    resolvedCount: number,
    largestBy: FindingValue,
): string[] {
    const lines: string[] = [];
    if (added.length > 0) {
        const largest = largestOf(added, largestBy);
        const named = `${location(largest)} (${tableCell(largest.message)})`;
        lines.push(
            added.length === 1
                ? `- **New, not listed:** 1 row, ${named}`
                : `- **New, not listed:** ${added.length} rows; the largest is ${named}`,
        );
    }
    if (resolvedCount > 0) {
        lines.push(`- **Resolved, not listed:** ${rowCount(resolvedCount)}`);
    }
    return lines;
}

type MeasuredOutcome = Extract<FunctionReport["outcome"], { kind: "measured" }>;

interface Commits {
    readonly base: string;
    readonly head: string;
}

/** Without a stored series a grown row's trend is the step from the merge base to HEAD. */
function grownRows(outcome: MeasuredOutcome, commits: Commits): readonly FindingRow[] {
    return inTableOrder(
        outcome.findings
            .filter(grewSinceBase)
            .map(({ valuesAtBase = {}, trend, ...finding }): FindingRow => ({
                ...finding,
                status: "grown",
                trend: trend ?? [
                    { commit: commits.base, values: valuesAtBase },
                    { commit: commits.head, values: finding.values ?? {} },
                ],
            })),
    );
}

function newAndResolvedRows(report: FunctionReport, outcome: MeasuredOutcome): FindingRow[] {
    const added = outcome.findings.filter(({ status }) => status === "new");
    const resolved = outcome.resolved.map((finding): FindingRow => ({
        ...finding,
        status: "resolved",
    }));
    return [...inGroupOrder(added, report.groups), ...inGroupOrder(resolved, report.groups)];
}

function changesOf(report: FunctionReport, commits: Commits): FunctionChanges | undefined {
    const { outcome } = report;
    if (outcome.kind === "unmeasurable" || inFullReportOnly(report)) {
        return undefined;
    }
    const added = outcome.findings.filter(({ status }) => status === "new");
    const counts = {
        new: added.length,
        existing: outcome.findings.length - added.length,
        resolved: outcome.resolved.length,
    };
    if (report.changesView === "grown-values" && report.values !== undefined) {
        const notListed = notListedLines(added, outcome.resolved.length, report.values[0]);
        const rows = grownRows(outcome, commits);
        return rows.length === 0 && notListed.length === 0
            ? undefined
            : { report, counts, rows, notListed };
    }
    const rows = newAndResolvedRows(report, outcome);
    return rows.length === 0 ? undefined : { report, counts, rows, notListed: [] };
}

function rowTables(report: FunctionReport, rows: readonly FindingRow[]): string[] {
    if (report.changesView === "grown-values") {
        return rows.length === 0
            ? []
            : ["", "#### Grown since the merge base", ...findingTable(rows, report.values)];
    }
    if (report.groups === undefined) {
        return findingTable(rows, report.values);
    }
    const declared = new Set(report.groups.map(({ id }) => id));
    const ungrouped = rows.filter((row) => row.group === undefined || !declared.has(row.group));
    return [
        ...report.groups.flatMap((group) => groupLines(group, rows, report.values, "####")),
        ...(ungrouped.length === 0
            ? []
            : ["", "#### In no declared group", ...findingTable(ungrouped, report.values)]),
    ];
}

function statusCounts(rows: readonly FindingRow[]): string {
    const count = (status: FindingRow["status"]) =>
        rows.filter((row) => row.status === status).length;
    const grown = count("grown");
    return grown > 0 ? `${grown} grown` : `${count("new")} new, ${count("resolved")} resolved`;
}

function leftOutLine(leftOut: readonly FindingRow[]): string[] {
    if (leftOut.length === 0) {
        return [];
    }
    const rows = leftOut.length === 1 ? "1 more row" : `${leftOut.length} more rows`;
    const verb = leftOut.length === 1 ? "is" : "are";
    return [
        "",
        `${rows} (${statusCounts(leftOut)}) ${verb} left out to fit; the job summary lists every row.`,
    ];
}

function functionSection(changes: FunctionChanges, limits: Limits): string[] {
    const { report, rows, notListed } = changes;
    const kept = rows.slice(0, limits.rowsPerFunction);
    return [
        `### \`${report.id}\` version ${report.version}`,
        "",
        countsLine(changes.counts),
        "",
        baseLine(report),
        ...(limits.withDeclarations
            ? [
                  "",
                  "<details>",
                  "<summary>What it measures and its limits</summary>",
                  "",
                  measuresLine(report),
                  ...limitLines(report),
                  "",
                  "</details>",
              ]
            : []),
        ...rowTables(report, kept),
        ...leftOutLine(rows.slice(kept.length)),
        ...(notListed.length === 0 ? [] : ["", ...notListed]),
    ];
}

function idList(reports: readonly FunctionReport[]): string {
    return reports.map(({ id }) => `\`${id}\``).join(", ");
}

function summaryLines(report: FitnessReport, changed: readonly FunctionChanges[]): string[] {
    const changedIds = new Set(changed.map(({ report: { id } }) => id));
    const shown = report.functions.filter((functionReport) => !inFullReportOnly(functionReport));
    const fullReportOnly = report.functions.filter(inFullReportOnly);
    const unchanged = shown.filter(
        ({ id, outcome }) => outcome.kind === "measured" && !changedIds.has(id),
    );
    const unmeasurableWhere = (atBase: boolean) =>
        shown.flatMap((functionReport) =>
            functionReport.outcome.kind === "unmeasurable" &&
            measuredOnlyAtBase(functionReport) === atBase
                ? [`\`${functionReport.id}\` (${functionReport.outcome.reason})`]
                : [],
        );
    const blinded = unmeasurableWhere(true);
    const unmeasurable = unmeasurableWhere(false);
    return [
        ...(unchanged.length === 0 ? [] : [`- **No change:** ${idList(unchanged)}`]),
        ...(fullReportOnly.length === 0
            ? []
            : [`- **In the full report only:** ${idList(fullReportOnly)}`]),
        ...(blinded.length === 0
            ? []
            : [`- **Measured at the merge base, not at HEAD:** ${blinded.join("; ")}`]),
        ...(unmeasurable.length === 0
            ? []
            : [`- **Not measurable at HEAD:** ${unmeasurable.join("; ")}`]),
    ];
}

function render(
    report: FitnessReport,
    changed: readonly FunctionChanges[],
    options: ChangesReportOptions,
    limits: Limits,
): string {
    const overview = summaryLines(report, changed);
    const lines = [changesMarker(report, changed), TITLE, "", headLine(report, options.headLabel)];
    if (report.functions.length === 0) {
        lines.push("", "No fitness function is registered.");
    } else if (changed.length === 0) {
        lines.push("", "No fitness function shows a new, resolved or grown finding.");
    }
    if (!limits.withDeclarations) {
        lines.push(
            "",
            "Each function's measures and limits are left out to fit; the job summary lists them.",
        );
    }
    if (overview.length > 0) {
        lines.push("", ...overview);
    }
    for (const changes of changed) {
        lines.push("", ...functionSection(changes, limits));
    }
    return `${lines.join("\n")}\n`;
}

/**
 * Scans down, not by bisection: one cap lower can lengthen the text, since every function with
 * exactly that many more rows gains a left-out note that may outweigh its last row.
 */
function largestFittingRowCap(
    fits: (rowsPerFunction: number) => boolean,
    mostRows: number,
): number | undefined {
    for (let rowsPerFunction = mostRows; rowsPerFunction >= 0; rowsPerFunction--) {
        if (fits(rowsPerFunction)) {
            return rowsPerFunction;
        }
    }
    return undefined;
}

/**
 * Per fitness function its new and resolved rows, or what its `changesView` shows instead; the
 * full report holds every row.
 */
export function changesReport(report: FitnessReport, options: ChangesReportOptions = {}): string {
    const changed = report.functions.flatMap((functionReport) => {
        const changes = changesOf(functionReport, {
            base: report.base.commit,
            head: report.head.commit,
        });
        return changes === undefined ? [] : [changes];
    });
    const { maxCharacters } = options;
    const uncapped = render(report, changed, options, UNLIMITED);
    if (maxCharacters === undefined || uncapped.length <= maxCharacters) {
        return uncapped;
    }
    const mostRows = Math.max(0, ...changed.map(({ rows }) => rows.length));
    for (const withDeclarations of [true, false]) {
        const textWith = (rowsPerFunction: number) =>
            render(report, changed, options, { rowsPerFunction, withDeclarations });
        const rowCap = largestFittingRowCap(
            (rowsPerFunction) => textWith(rowsPerFunction).length <= maxCharacters,
            mostRows,
        );
        if (rowCap !== undefined) {
            return textWith(rowCap);
        }
    }
    return [
        changesMarker(report, changed),
        TITLE,
        "",
        `The changes do not fit in ${maxCharacters} characters; the job summary lists them.`,
        "",
    ].join("\n");
}
