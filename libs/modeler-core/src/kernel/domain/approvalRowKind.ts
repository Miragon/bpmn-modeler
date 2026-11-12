import { CodeApproval } from "./codeApproval";

export const ALLOWANCE_KINDS = ["plugin", "rulePackage"] as const;

export type AllowanceKind = (typeof ALLOWANCE_KINDS)[number];

export interface ApprovalRowReading {
    readonly kind: AllowanceKind;
    /**
     * An allowance of an add-on at its origin, or a row pinned to the content
     * found at one place, as VS Code 1.21.0 and IntelliJ 1.16.0 stored every row.
     */
    readonly format: "allowance" | "content";
}

/** Names the digest algorithm too, so a changed algorithm reads as another content. */
export const RULE_PACKAGE_CONTENT_HASH_PREFIX = "bpmnlint-closure-v1:";

const ALLOWANCE_MARKER_PREFIX = "allowance-v1:";
const PLUGIN_CONTENT_HASH = /^[0-9a-f]{64}$/;

/** Stored in `contentHash`: the kind of add-on and the rule the allowance was given under. */
export function allowanceMarkerOf(kind: AllowanceKind): string {
    return ALLOWANCE_MARKER_PREFIX + kind;
}

/**
 * The one reading of a row's kind: the host keeps every kind in one list, and
 * only the `contentHash` tells them apart. A row of a kind this build does not
 * know is no row of any kind.
 */
export function approvalRowReadingOf({
    contentHash,
}: Pick<CodeApproval, "contentHash">): ApprovalRowReading | undefined {
    const allowanceKind = ALLOWANCE_KINDS.find((kind) => contentHash === allowanceMarkerOf(kind));
    if (allowanceKind !== undefined) {
        return { kind: allowanceKind, format: "allowance" };
    }
    if (PLUGIN_CONTENT_HASH.test(contentHash)) {
        return { kind: "plugin", format: "content" };
    }
    return contentHash.startsWith(RULE_PACKAGE_CONTENT_HASH_PREFIX)
        ? { kind: "rulePackage", format: "content" }
        : undefined;
}

export function isApprovalRowOf(
    kind: AllowanceKind,
    row: Pick<CodeApproval, "contentHash">,
): boolean {
    return approvalRowReadingOf(row)?.kind === kind;
}

export function approvalRowsOf<R extends Pick<CodeApproval, "contentHash">>(
    kind: AllowanceKind,
    rows: readonly R[],
): R[] {
    return rows.filter((row) => isApprovalRowOf(kind, row));
}
