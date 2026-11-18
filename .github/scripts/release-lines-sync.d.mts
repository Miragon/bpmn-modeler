import type { ShipsInDeclaration } from "./release-declaration.mjs";
import type {
    Attribution,
    AttributionFile,
    AttributionWrite,
    ReleaseLineRegistry,
} from "./release-routing.mjs";

/** The Git Data API calls that chain attribution commits onto main. */
export interface GitDataApi {
    treeOf(commitSha: string): string;
    createTree(baseTree: string, files: readonly AttributionFile[]): string;
    createCommit(commit: { message: string; tree: string; parent: string }): string;
    fastForward(sha: string): void;
}

export function writeAttributions(
    api: GitDataApi,
    base: string,
    writes: readonly AttributionWrite[],
): { unchanged: AttributionWrite[] };

export interface PullRequestToCheck {
    title: string;
    body: string;
    files: readonly string[];
    headBranch: string | undefined;
}

export interface CheckResult {
    errors: string[];
    derivedLines: string[];
    declaration: ShipsInDeclaration;
    attribution: Attribution;
    /** The boxes to put under Ships in; only when the PR must declare its lines. */
    suggestion: string | undefined;
}

export function checkPullRequest(
    pullRequest: PullRequestToCheck,
    registry: ReleaseLineRegistry,
): CheckResult;
export function checkSummary(result: Pick<CheckResult, "errors">): string;
