import type { AttributionFile, AttributionWrite } from "./release-routing.mjs";

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
