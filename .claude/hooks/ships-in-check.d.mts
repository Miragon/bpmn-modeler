import type { ReleaseLineRegistry } from "../../.github/scripts/release-routing.mjs";

export interface HookInput {
    tool_name?: string;
    cwd?: string;
    tool_input?: { command?: string };
    /** Bash's result: stdout, stderr, interrupted and isImage. */
    tool_response?: string | { stdout?: string; stderr?: string; [field: string]: unknown };
    [field: string]: unknown;
}

export interface PullRequestTarget {
    action: "create" | "edit";
    /** A number, URL or branch; gh pr edit falls back to the current branch's PR. */
    selector?: string;
    repo?: string;
    /** Whether a gh pr edit sets the title or body. */
    setsText: boolean;
}

/** The fields of `gh pr view --json number,url,state`. */
export interface PullRequestView {
    number?: number;
    url: string;
    /** OPEN, CLOSED or MERGED. */
    state?: string;
}

export interface HookPullRequest {
    number: number;
    title: string;
    body: string;
    headBranch: string | undefined;
    fromFork: boolean;
    files: string[];
}

export interface HookOutput {
    decision?: "block";
    reason?: string;
    hookSpecificOutput?: { hookEventName: "PostToolUse"; additionalContext: string };
}

export function pullRequestTargets(command: string): PullRequestTarget[];
export function lastPullRequestUrl(
    text: string | undefined,
): { repo: string; number: number; url: string } | undefined;
export function githubRepos(remoteOutput: string): string[];
export function viewArguments(input: HookInput): string[] | undefined;
export function ownOpenPullRequest(
    view: PullRequestView,
    ownRepos: readonly string[],
): { repo: string; number: number } | undefined;
export function hookOutput(
    pullRequest: HookPullRequest,
    registry: ReleaseLineRegistry,
): HookOutput | undefined;
