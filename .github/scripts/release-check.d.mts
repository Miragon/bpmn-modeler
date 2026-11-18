import type { ReleaseLineRegistry } from "./release-routing.mjs";

export interface PullRequestToValidate {
    title: string;
    body: string | undefined;
    files: readonly string[];
    registry: ReleaseLineRegistry;
    headBranch: string | undefined;
    /** Whether the head branch lives in a fork; a fork's branch is never the release PR. */
    fromFork?: boolean;
}

export function needsDeclaration(
    change: { title: string; files: readonly string[]; body: string | undefined },
    registry: ReleaseLineRegistry,
): boolean;
export function validate(pullRequest: PullRequestToValidate): string[];
