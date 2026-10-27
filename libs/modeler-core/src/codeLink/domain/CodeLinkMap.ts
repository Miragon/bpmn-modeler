/**
 * Pure domain core of the activity→code map: the in-memory entry shape, the
 * on-disk JSON artifact shape and the relative↔absolute path conversions.
 *
 * No `vscode` / Node host modules — only `path` (string math).
 */
import { posix } from "path";

import { joinWorkspacePath } from "../../kernel/domain/workspacePath";
import { ImplementationKind } from "./ImplementationReference";

/** Bumped only on a breaking change to {@link CodeLinkMapJson}'s shape. */
export const CODE_LINK_SCHEMA_VERSION = 1;

/**
 * One activity's resolution state held in memory while the editor is open.
 * `paths` are absolute (the `uri.path` form the workspace search speaks) so they
 * can be read back for verification and compared against watcher events; they
 * are relativised only when written to the artifact.
 */
export interface CodeLinkMapEntry {
    activityId: string;
    kind: ImplementationKind;
    reference: string;
    resolved: boolean;
    paths: string[];
}

/** One entry as persisted: identical to {@link CodeLinkMapEntry} but with workspace-relative paths. */
interface CodeLinkMapJsonEntry {
    activityId: string;
    kind: ImplementationKind;
    reference: string;
    resolved: boolean;
    paths: string[];
}

/**
 * The persisted artifact. A full inventory (unresolved entries included) so
 * external/AI tooling sees every task, and a warm cache the host reloads on the
 * next open to skip the cold batched scan.
 */
export interface CodeLinkMapJson {
    schemaVersion: number;
    bpmnFile: string;
    generatedAt: string;
    entries: CodeLinkMapJsonEntry[];
}

/**
 * Workspace-relative POSIX path of `absolutePath` under `workspaceRoot`. Both
 * inputs are `uri.path`-style POSIX strings, so `posix.relative` is exact.
 */
export function toRelative(absolutePath: string, workspaceRoot: string): string {
    return posix.relative(workspaceRoot, absolutePath);
}

/** Absolute path of a workspace-relative POSIX path — the inverse of {@link toRelative}. */
export function toAbsolute(relativePath: string, workspaceRoot: string): string {
    return joinWorkspacePath(workspaceRoot, relativePath);
}

/**
 * Assembles the artifact from the in-memory entries, relativising every path so
 * the file is workspace-portable. Pure and deterministic given its inputs —
 * `generatedAt` is passed in rather than read from the clock here so the result
 * can be asserted in tests.
 */
export function buildMapJson(params: {
    bpmnFile: string;
    generatedAt: string;
    workspaceRoot: string;
    entries: readonly CodeLinkMapEntry[];
}): CodeLinkMapJson {
    return {
        schemaVersion: CODE_LINK_SCHEMA_VERSION,
        bpmnFile: params.bpmnFile,
        generatedAt: params.generatedAt,
        entries: params.entries.map((entry) => ({
            activityId: entry.activityId,
            kind: entry.kind,
            reference: entry.reference,
            resolved: entry.resolved,
            paths: entry.paths.map((path) => toRelative(path, params.workspaceRoot)),
        })),
    };
}

/**
 * Parses the artifact, returning `undefined` (not throwing) on anything that is
 * not a current-schema map — a hand-edited, truncated, or older file must
 * degrade to "no warm cache", never crash the open.
 */
export function parseMapJson(raw: string): CodeLinkMapJson | undefined {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as CodeLinkMapJson).schemaVersion !== CODE_LINK_SCHEMA_VERSION ||
        !Array.isArray((parsed as CodeLinkMapJson).entries)
    ) {
        return undefined;
    }
    // Validate each entry's shape too: an `entries` array alone is not enough.
    // A hand-edited/truncated file can carry a malformed element (e.g. `[null]`,
    // a missing field, or a non-string `paths`) that would NPE in
    // toAbsoluteEntries and crash the open. One bad entry drops the whole file.
    if (!(parsed as CodeLinkMapJson).entries.every(isValidJsonEntry)) {
        return undefined;
    }
    return parsed as CodeLinkMapJson;
}

/** Structural guard for one persisted entry — every field present and correctly typed. */
function isValidJsonEntry(entry: unknown): entry is CodeLinkMapJsonEntry {
    if (typeof entry !== "object" || entry === null) {
        return false;
    }
    const candidate = entry as Record<string, unknown>;
    return (
        typeof candidate.activityId === "string" &&
        typeof candidate.kind === "string" &&
        typeof candidate.reference === "string" &&
        typeof candidate.resolved === "boolean" &&
        Array.isArray(candidate.paths) &&
        candidate.paths.every((path) => typeof path === "string")
    );
}

/** Re-hydrates persisted entries to the in-memory shape (relative paths → absolute). */
export function toAbsoluteEntries(
    json: CodeLinkMapJson,
    workspaceRoot: string,
): CodeLinkMapEntry[] {
    return json.entries.map((entry) => ({
        activityId: entry.activityId,
        kind: entry.kind,
        reference: entry.reference,
        resolved: entry.resolved,
        paths: entry.paths.map((path) => toAbsolute(path, workspaceRoot)),
    }));
}
