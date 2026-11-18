export interface ReleaseLine {
    id: string;
    componentPath: string;
    ships: readonly string[];
    /** Checked only against the files the line ships. */
    breaking: readonly string[];
    /** Where a reader decides whether the line offers a change, for the hook and reviews. */
    wiring?: string;
}

export interface ReleaseLineRegistry {
    ignore: readonly string[];
    unreleased: readonly string[];
    lines: readonly ReleaseLine[];
}

export interface AttributionGroup {
    subject: string;
    lines: string[];
}

export interface Attribution {
    /** declared: the PR ticks lines; none: it ticks `none`; derived: from the files. */
    source: "declared" | "derived" | "none";
    groups: AttributionGroup[];
}

export interface MergedPullRequest {
    head: string;
    body: string;
}

export interface MergedCommit {
    sha: string;
    /** The commit's subject, which carries the merged pull request's title. */
    title: string;
    files: readonly string[];
    /** The merged pull request; null when none was found, absent when not looked up. */
    pullRequest?: MergedPullRequest | null;
    /** The lines that have not released the commit yet; every line when absent. */
    unreleasedLines?: readonly string[];
}

export interface ExistingAttribution {
    /** The full sha or the short one an attribution commit's subject names. */
    sha: string;
    lines: readonly string[];
}

export interface MissingAttribution {
    sha: string;
    subject: string;
    lines: string[];
}

export interface AttributionFile {
    path: string;
    content: string;
}

export interface AttributionWrite extends MissingAttribution {
    message: string;
    files: AttributionFile[];
}

export interface RoutingDecision {
    sha: string;
    title: string;
    skipped: string | undefined;
    attributable: boolean;
    /** The lines this run attributes the commit to. */
    lines: string[];
    /** The lines that already carry its attribution. */
    attributed: string[];
    /** Absent for a skipped commit. */
    source?: Attribution["source"];
    pullRequestFound?: boolean;
}

export interface TagWindow {
    id: string;
    /** The first-parent commits after the line's last tag, oldest first. */
    shas: readonly string[];
}

export const ATTRIBUTED_TYPES: readonly string[];

export function isAttributedType(title: string): boolean;
export function isAttributedSubject(subject: string): boolean;
export function isBreaking(subject: string): boolean;
export function pullRequestNumber(title: string): number | undefined;
export function derivedLines(files: readonly string[], registry: ReleaseLineRegistry): string[];
export function breakingLinesOf(
    title: string,
    files: readonly string[],
    registry: ReleaseLineRegistry,
): string[];
export function resolveAttribution(
    change: { title: string; files: readonly string[]; body?: string },
    registry: ReleaseLineRegistry,
): Attribution;
export function suggest(change: {
    title?: string;
    files: readonly string[];
    registry: ReleaseLineRegistry;
}): string;
export function releaseBranchOf(targetBranch: string): string;
export function syncedSha(message: string): string | undefined;
export function skipReason(commit: {
    title: string;
    pullRequest?: MergedPullRequest | null;
}): string | undefined;
export function attributionMessage(subject: string, sha: string): string;
export function attributionFile(componentPath: string, sha: string): AttributionFile;
export function commitsSinceTags(
    windows: readonly TagWindow[],
): { sha: string; unreleasedLines: string[] }[];
export function planAttributions(
    commits: readonly MergedCommit[],
    existing: readonly ExistingAttribution[],
    registry: ReleaseLineRegistry,
): { decisions: RoutingDecision[]; writes: AttributionWrite[] };
export function routingSummary(heading: string, decisions: readonly RoutingDecision[]): string;
export function auditReport(
    writes: readonly MissingAttribution[],
    reconcileCommand: string,
): string;
