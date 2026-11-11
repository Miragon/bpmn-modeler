import { Allowance, allowanceKeyOf, allowanceRowOf } from "./allowance";
import { AllowanceKind, approvalRowReadingOf } from "./approvalRowKind";
import { CodeApproval, codeApprovalChange, CodeApprovalChange } from "./codeApproval";

/** Where a row pinned to content was given, and for which kind of code. */
export interface ContentRowPlace {
    readonly id: string;
    readonly kind: AllowanceKind;
}

export function contentRowsToLocate(rows: readonly CodeApproval[]): ContentRowPlace[] {
    const places = new Map<string, ContentRowPlace>();
    for (const row of rows) {
        const reading = approvalRowReadingOf(row);
        if (reading?.format === "content" && !places.has(row.pluginId)) {
            places.set(row.pluginId, { id: row.pluginId, kind: reading.kind });
        }
    }
    return [...places.values()];
}

/**
 * Rewrites each row pinned to content whose place was located as the
 * allowance of the add-on there. A row whose place was not found stays: one
 * list can serve several machines, and a folder gone here may exist on another.
 */
export function contentRowMigrationOf(
    rows: readonly CodeApproval[],
    located: ReadonlyMap<string, Allowance>,
): CodeApprovalChange | undefined {
    const storedIds = new Set(rows.map(({ pluginId }) => pluginId));
    const allow = new Map<string, CodeApproval>();
    const revoke: string[] = [];
    for (const { id, kind } of contentRowsToLocate(rows)) {
        const allowance = located.get(id);
        if (allowance?.kind !== kind) {
            continue;
        }
        revoke.push(id);
        const key = allowanceKeyOf(allowance);
        if (!storedIds.has(key)) {
            allow.set(key, allowanceRowOf(allowance));
        }
    }
    return revoke.length === 0 ? undefined : codeApprovalChange([...allow.values()], revoke);
}
