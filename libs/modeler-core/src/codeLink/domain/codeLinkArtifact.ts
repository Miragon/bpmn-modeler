/**
 * The on-disk JSON artifact of the activity→code map and the relative↔absolute
 * path conversions. `CodeLinkMap` reads and writes it.
 *
 * No `vscode` / Node host modules — only `path` (string math).
 */
import { posix } from "path";

import { joinWorkspacePath } from "../../kernel/domain/workspacePath";
import { ImplementationKind } from "./ImplementationReference";

/** Bumped only on a breaking change to {@link CodeLinkMapJson}'s shape. */
export const CODE_LINK_SCHEMA_VERSION = 1;

/**
 * One entry as persisted, with workspace-relative paths. `resolved` is written
 * for tooling reading the file; the map derives it from `paths` on load.
 */
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
 * Workspace-relative POSIX path of a linked file. Unlike `relativeToRoot` it
 * climbs out with `../`: the search covers every workspace folder, so a link
 * can sit outside the diagram's root.
 */
export function toRelative(absolutePath: string, workspaceRoot: string): string {
    return posix.relative(workspaceRoot, absolutePath);
}

/** Absolute path of a workspace-relative POSIX path — the inverse of {@link toRelative}. */
export function toAbsolute(relativePath: string, workspaceRoot: string): string {
    return joinWorkspacePath(workspaceRoot, relativePath);
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
    // CodeLinkMap.fromArtifact and crash the open. One bad entry drops the whole file.
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
