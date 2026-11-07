import type { FindingGroup } from "./fitnessFunction";
import {
    baseLine,
    countsLine,
    type FindingRow,
    findingTable,
    groupLines,
    headLine,
    inTableOrder,
    limitLines,
    measuresLine,
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

/** Its findings at the merge base drop out of the delta without being resolved. */
function measuredOnlyAtBase({ base, outcome }: FunctionReport): boolean {
    return outcome.kind === "unmeasurable" && base.unmeasurable === undefined;
}

/** A CI job reads whether anything changed from this first line, so it stays fixed. */
function changesMarker(report: FitnessReport, changed: readonly FunctionChanges[]): string {
    return changed.length === 0 && !report.functions.some(measuredOnlyAtBase)
        ? "<!-- fitness-changes: none -->"
        : "<!-- fitness-changes: some -->";
}

const TITLE = "## Fitness function changes";

interface FunctionChanges {
    readonly report: FunctionReport;
    readonly existingCount: number;
    /** New rows first, then resolved ones, each in group and table order: the order they are kept in. */
    readonly rows: readonly FindingRow[];
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

function changesOf(report: FunctionReport): FunctionChanges | undefined {
    const { outcome } = report;
    if (outcome.kind === "unmeasurable") {
        return undefined;
    }
    const added = outcome.findings.filter(({ status }) => status === "new");
    if (added.length === 0 && outcome.resolved.length === 0) {
        return undefined;
    }
    const resolved = outcome.resolved.map((finding): FindingRow => ({
        ...finding,
        status: "resolved",
    }));
    return {
        report,
        existingCount: outcome.findings.length - added.length,
        rows: [...inGroupOrder(added, report.groups), ...inGroupOrder(resolved, report.groups)],
    };
}

function rowTables(report: FunctionReport, rows: readonly FindingRow[]): string[] {
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

function leftOutLine(leftOut: readonly FindingRow[]): string[] {
    if (leftOut.length === 0) {
        return [];
    }
    const newCount = leftOut.filter(({ status }) => status === "new").length;
    const rows = leftOut.length === 1 ? "1 more row" : `${leftOut.length} more rows`;
    const verb = leftOut.length === 1 ? "is" : "are";
    return [
        "",
        `${rows} (${newCount} new, ${leftOut.length - newCount} resolved) ${verb} left out to fit; the job summary lists every row.`,
    ];
}

function functionSection(changes: FunctionChanges, limits: Limits): string[] {
    const { report, rows } = changes;
    const kept = rows.slice(0, limits.rowsPerFunction);
    const newCount = rows.filter(({ status }) => status === "new").length;
    return [
        `### \`${report.id}\` version ${report.version}`,
        "",
        countsLine({
            new: newCount,
            existing: changes.existingCount,
            resolved: rows.length - newCount,
        }),
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
    ];
}

function summaryLines(report: FitnessReport, changed: readonly FunctionChanges[]): string[] {
    const changedIds = new Set(changed.map(({ report: { id } }) => id));
    const unchanged = report.functions.filter(
        ({ id, outcome }) => outcome.kind === "measured" && !changedIds.has(id),
    );
    const unmeasurableWhere = (atBase: boolean) =>
        report.functions.flatMap((functionReport) =>
            functionReport.outcome.kind === "unmeasurable" &&
            measuredOnlyAtBase(functionReport) === atBase
                ? [`\`${functionReport.id}\` (${functionReport.outcome.reason})`]
                : [],
        );
    const blinded = unmeasurableWhere(true);
    const unmeasurable = unmeasurableWhere(false);
    return [
        ...(unchanged.length === 0
            ? []
            : [`- **No change:** ${unchanged.map(({ id }) => `\`${id}\``).join(", ")}`]),
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
        lines.push("", "No fitness function has a new or resolved finding.");
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

/** Only the new and resolved rows per fitness function; the full report holds the existing ones. */
export function changesReport(report: FitnessReport, options: ChangesReportOptions = {}): string {
    const changed = report.functions.flatMap((functionReport) => {
        const changes = changesOf(functionReport);
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
