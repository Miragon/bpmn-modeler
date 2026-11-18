import type { MergedPullRequest } from "./release-routing.mjs";

/** Runs `gh api` with the arguments and returns its stdout. */
export type GhApi = (args: readonly string[], input?: unknown) => string;

export interface FetchedPullRequest {
    number: number;
    /** `open` or `closed`, as the REST API says. */
    state: string;
    title: string;
    body: string;
    headBranch: string;
    fromFork: boolean;
    /** Every changed file, a renamed file under its old and its new name. */
    files: string[];
}

export const ghApi: GhApi;
export function fetchPullRequest(
    repo: string,
    number: number | string,
    api?: GhApi,
): FetchedPullRequest;
export function mergedPullRequest(
    repo: string,
    commit: { sha: string; title: string },
    api?: GhApi,
): MergedPullRequest | null;
