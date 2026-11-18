// Reads pull requests from the GitHub REST API through `gh api`, for the
// release-line check, the sync and the Claude Code hook, so all three read a
// PR the same way. Each reader takes the `gh api` runner: the hook passes one
// with a deadline, a spec passes a fake.
import { execFileSync } from "node:child_process";

import { pullRequestNumber } from "./release-routing.mjs";

/** `gh api` with the arguments, the input sent as JSON on stdin; returns stdout. */
export function ghApi(args, input) {
    return execFileSync("gh", ["api", ...args], {
        encoding: "utf8",
        input: input === undefined ? undefined : JSON.stringify(input),
        stdio: ["pipe", "pipe", "pipe"],
    });
}

/**
 * A PR's title, body, head branch, state and every changed file, renamed
 * files under both names: a file moved out of a shipped folder changes that
 * line too. The file list is paged, so a PR with more than 100 files is read
 * whole.
 */
export function fetchPullRequest(repo, number, api = ghApi) {
    const pull = JSON.parse(api([`repos/${repo}/pulls/${number}`]));
    const files = api([
        "--paginate",
        `repos/${repo}/pulls/${number}/files?per_page=100`,
        "--jq",
        ".[] | .filename, (.previous_filename // empty)",
    ])
        .split("\n")
        .filter((file) => file !== "");
    return {
        number: pull.number,
        state: pull.state,
        title: pull.title,
        body: pull.body ?? "",
        headBranch: pull.head.ref,
        // A deleted fork leaves no head repository.
        fromFork: pull.head.repo?.full_name !== pull.base.repo.full_name,
        files,
    };
}

function mergedSummary(pull) {
    return { head: pull.head.ref, body: pull.body ?? "" };
}

function pullRequestNamedBy(repo, { sha, title }, api) {
    const number = pullRequestNumber(title);
    if (number === undefined) return undefined;
    try {
        const pull = JSON.parse(api([`repos/${repo}/pulls/${number}`]));
        return pull.merged_at && pull.merge_commit_sha === sha ? pull : undefined;
    } catch {
        // `(#N)` may name an issue; the commit's PR list still answers.
        return undefined;
    }
}

/**
 * The PR a commit on main was merged from, with its body as it reads now;
 * null when there is none. The `(#N)` of a squash subject is asked first: right
 * after a push, GitHub may not have linked the commit to its PR yet.
 */
export function mergedPullRequest(repo, commit, api = ghApi) {
    const named = pullRequestNamedBy(repo, commit, api);
    if (named !== undefined) return mergedSummary(named);
    const pulls = JSON.parse(api([`repos/${repo}/commits/${commit.sha}/pulls`]));
    const merged =
        pulls.find((pull) => pull.merge_commit_sha === commit.sha) ??
        pulls.find((pull) => pull.merged_at && pull.base.ref === "main");
    return merged === undefined ? null : mergedSummary(merged);
}
