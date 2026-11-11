import { allowanceMarkerOf, AllowanceKind, approvalRowReadingOf } from "./approvalRowKind";
import {
    CodeApproval,
    codeApprovalChange,
    CodeApprovalChange,
    ReviewAnswer,
    SessionAnswer,
} from "./codeApproval";
import { installedPackageNameOf, NODE_MODULES } from "./installedPackagePath";
import { CodeOrigin } from "./repositoryIdentity";
import { relativeToRoot } from "./rootContainment";

/**
 * The user allowed an add-on at its origin, whatever content it has there now
 * or later. Every worktree of one clone shares the origin, so allowing an
 * add-on in one allows it in all; another repository or clone asks again.
 */
export interface Allowance {
    readonly kind: AllowanceKind;
    /** The remote the code was found on; empty locally. One host list can hold rows of several. */
    readonly host: string;
    /** The repository's common directory, or the add-on's own folder outside every repository. */
    readonly origin: { readonly kind: "repository" | "folder"; readonly path: string };
    /** The add-on's place in the repository, spelled so that an update keeps it; empty for a folder origin. */
    readonly addOn: string;
}

/** Code found at one place; `id` is that place, as rows pinned to content named it. */
export interface AllowableCode {
    readonly id: string;
    readonly allowance: Allowance;
}

export type AllowanceState = "allowed" | "new" | "declined";

export interface AllowanceOutcome<C extends AllowableCode> {
    readonly allowed: readonly C[];
    /** Keyed by {@link allowanceKeyOf}, one entry per allowance. */
    readonly answers: ReadonlyMap<string, SessionAnswer>;
}

const ADD_ON_PLACE_RULES: Record<AllowanceKind, (belowWorktree: string) => string> = {
    plugin: (belowWorktree) => belowWorktree,
    rulePackage: installedAddOnPlaceOf,
};

/** `folder` is the add-on's realpath, which `origin` was located from. */
export function allowanceOf(
    kind: AllowanceKind,
    folder: string,
    origin: CodeOrigin,
    host: string,
): Allowance {
    if (origin.kind === "repository") {
        const belowWorktree = relativeToRoot(folder, origin.worktreeRoot);
        if (belowWorktree !== undefined) {
            return {
                kind,
                host,
                origin: { kind: "repository", path: origin.commonDir },
                addOn: ADD_ON_PLACE_RULES[kind](belowWorktree),
            };
        }
    }
    return { kind, host, origin: { kind: "folder", path: folder }, addOn: "" };
}

/**
 * A package manager may install a package deeper, as pnpm does below
 * `.pnpm/<name>@<version>`, so the place is the first `node_modules` and the
 * name: an update keeps it, and a nested copy shares the hoisted one's.
 */
function installedAddOnPlaceOf(belowWorktree: string): string {
    const segments = belowWorktree.split("/");
    const firstNodeModules = segments.indexOf(NODE_MODULES);
    return firstNodeModules === -1
        ? belowWorktree
        : [...segments.slice(0, firstNodeModules + 1), installedPackageNameOf(belowWorktree)].join(
              "/",
          );
}

export function allowanceKeyOf({ kind, host, origin, addOn }: Allowance): string {
    return JSON.stringify([kind, host, origin.kind, origin.path, addOn]);
}

/** The row the hosts store unchanged: the key as its id, the marker in place of a hash. */
export function allowanceRowOf(allowance: Allowance): CodeApproval {
    return { pluginId: allowanceKeyOf(allowance), contentHash: allowanceMarkerOf(allowance.kind) };
}

/** Its allowance, or a row pinned to content at its own place, whatever that content was. */
export function isAllowed(code: AllowableCode, rows: readonly CodeApproval[]): boolean {
    const allowanceRow = allowanceRowOf(code.allowance);
    return rows.some(
        (row) =>
            (row.pluginId === allowanceRow.pluginId &&
                row.contentHash === allowanceRow.contentHash) ||
            isContentRowAt(code, row),
    );
}

export function allowanceStateOf(
    code: AllowableCode,
    rows: readonly CodeApproval[],
    declinedKeys: ReadonlySet<string>,
): AllowanceState {
    if (isAllowed(code, rows)) {
        return "allowed";
    }
    return declinedKeys.has(allowanceKeyOf(code.allowance)) ? "declined" : "new";
}

/** Each allowance once, as two worktrees can show one and the change refuses an id named twice. */
export function allowingAllowances(codes: readonly AllowableCode[]): CodeApprovalChange {
    const rows = new Map(
        codes.map(({ allowance }) => [allowanceKeyOf(allowance), allowanceRowOf(allowance)]),
    );
    return codeApprovalChange([...rows.values()], []);
}

/** A content row at its place goes too: it would allow the add-on there again. */
export function revokingAllowance(
    code: AllowableCode,
    rows: readonly CodeApproval[],
): CodeApprovalChange {
    const contentRowHere = rows.some((row) => isContentRowAt(code, row));
    return codeApprovalChange(
        [],
        [allowanceKeyOf(code.allowance), ...(contentRowHere ? [code.id] : [])],
    );
}

/**
 * A checked place allows its allowance, so every pending place of it, such
 * as the same add-on in another worktree. Content left to a view is neither
 * allowed nor declined.
 */
export function allowanceOutcome<C extends AllowableCode>(
    pending: readonly C[],
    answer: ReviewAnswer,
): AllowanceOutcome<C> {
    const keyOf = (code: C) => allowanceKeyOf(code.allowance);
    if (answer.kind === "leftForView") {
        return {
            allowed: [],
            answers: new Map(pending.map((code) => [keyOf(code), "leftForView"])),
        };
    }
    const checkedIds = new Set(answer.ids);
    const checkedKeys = new Set(pending.filter(({ id }) => checkedIds.has(id)).map(keyOf));
    const isChecked = (code: C) => checkedKeys.has(keyOf(code));
    return {
        allowed: pending.filter(isChecked),
        answers: new Map(
            pending.filter((code) => !isChecked(code)).map((code) => [keyOf(code), "declined"]),
        ),
    };
}

function isContentRowAt(code: AllowableCode, row: CodeApproval): boolean {
    const reading = approvalRowReadingOf(row);
    return (
        row.pluginId === code.id &&
        reading?.format === "content" &&
        reading.kind === code.allowance.kind
    );
}
