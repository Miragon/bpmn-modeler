import { ReviewAnswer, SessionAnswer } from "./approvalAnswer";
import { allowanceMarkerOf, AllowanceKind, approvalRowReadingOf } from "./approvalRowKind";
import { CodeApproval, codeApprovalChange, CodeApprovalChange } from "./codeApproval";
import { installedPlaceOf, NODE_MODULES } from "./installedPackagePath";
import { CodeOrigin } from "./repositoryIdentity";
import { relativeToRoot } from "./rootContainment";
import { lastWorkspacePathSegment, parentWorkspacePath, withLowerCaseDrive } from "./workspacePath";

/** The host part of code found on this machine. */
export const LOCAL_HOST = "";

export const ALLOWANCE_COVERS_TEXT =
    "covers it in every worktree of its repository, or in its folder outside a repository, later changes included";

/**
 * The user allowed an add-on at its origin, whatever content it has there now
 * or later. Every worktree of one clone shares the origin, so allowing an
 * add-on in one allows it in all; another repository or clone asks again.
 */
export interface Allowance {
    readonly kind: AllowanceKind;
    /** The remote the code was found on; {@link LOCAL_HOST} locally. One host list can hold rows of several. */
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

/** Workspace code that runs only once the user allowed its add-on. */
export interface ApprovableArtifact extends AllowableCode {
    readonly name: string;
}

export type AllowanceState = "allowed" | "new" | "declined";

export interface AllowanceOutcome<C extends AllowableCode> {
    readonly allowed: readonly C[];
    /** Keyed by {@link allowanceKeyOf}, one entry per allowance. */
    readonly answers: ReadonlyMap<string, SessionAnswer>;
}

const DOT_GIT = ".git";

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
 * path below the last: an update keeps it, and a nested copy shares the
 * hoisted one's. That path is the whole rest, not the name, so a folder that
 * is no package root, such as a Yarn store's `.store/<slug>/package`, shares
 * its place with no other.
 */
function installedAddOnPlaceOf(belowWorktree: string): string {
    const place = installedPlaceOf(belowWorktree);
    if (place === undefined) {
        return belowWorktree;
    }
    const segments = belowWorktree.split("/");
    const firstNodeModulesDir = segments.slice(0, segments.indexOf(NODE_MODULES) + 1).join("/");
    return `${firstNodeModulesDir}/${belowWorktree.slice(place.dir.length + 1)}`;
}

/** A linked worktree's origin comes from git's files, its main worktree's from the host's spelling. */
export function allowanceKeyOf({ kind, host, origin, addOn }: Allowance): string {
    return JSON.stringify([kind, host, origin.kind, withLowerCaseDrive(origin.path), addOn]);
}

/** The row the hosts store unchanged: the key as its id, the marker in place of a hash. */
export function allowanceRowOf(allowance: Allowance): CodeApproval {
    return { pluginId: allowanceKeyOf(allowance), contentHash: allowanceMarkerOf(allowance.kind) };
}

/** Its allowance, or, found locally, a row pinned to content at its own place, whatever that content was. */
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

/**
 * Every local content row at its place, or at a place `located` as the same
 * allowance, goes too: each would allow the add-on there again.
 */
export function revokingAllowance(
    code: AllowableCode,
    rows: readonly CodeApproval[],
    located: ReadonlyMap<string, Allowance>,
): CodeApprovalChange {
    const key = allowanceKeyOf(code.allowance);
    const revoked = new Set([key]);
    if (code.allowance.host === LOCAL_HOST) {
        for (const row of rows) {
            const allowanceThere = located.get(row.pluginId);
            const isOfThisAllowance =
                row.pluginId === code.id ||
                (allowanceThere !== undefined && allowanceKeyOf(allowanceThere) === key);
            if (isOfThisAllowance && isContentRowOf(code.allowance.kind, row)) {
                revoked.add(row.pluginId);
            }
        }
    }
    return codeApprovalChange([], [...revoked]);
}

/**
 * The code to ask about: one place per allowance, the first found, as two
 * worktrees or a hoisted and a nested copy show one add-on.
 */
export function pendingAllowances<C extends AllowableCode>(
    found: readonly C[],
    rows: readonly CodeApproval[],
    answeredKeys: ReadonlySet<string>,
): C[] {
    const pending = new Map<string, C>();
    for (const code of found) {
        const key = allowanceKeyOf(code.allowance);
        if (!pending.has(key) && !answeredKeys.has(key) && !isAllowed(code, rows)) {
            pending.set(key, code);
        }
    }
    return [...pending.values()];
}

/** The folder a repository origin names: the worktree that holds `.git`, or a bare repository itself. */
export function repositoryFolderOf({ origin }: Allowance): string | undefined {
    if (origin.kind === "folder") {
        return undefined;
    }
    return lastWorkspacePathSegment(origin.path) === DOT_GIT
        ? (parentWorkspacePath(origin.path) ?? origin.path)
        : origin.path;
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

/**
 * A content row names no host, and VS Code keeps the list on the client, so
 * in a remote window it may have been given on another machine at that path.
 */
function isContentRowAt(code: AllowableCode, row: CodeApproval): boolean {
    return (
        code.allowance.host === LOCAL_HOST &&
        row.pluginId === code.id &&
        isContentRowOf(code.allowance.kind, row)
    );
}

function isContentRowOf(kind: AllowanceKind, row: CodeApproval): boolean {
    const reading = approvalRowReadingOf(row);
    return reading?.format === "content" && reading.kind === kind;
}
