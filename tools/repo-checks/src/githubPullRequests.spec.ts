import { describe, expect, it } from "vitest";

import {
    fetchPullRequest,
    mergedPullRequest,
    type GhApi,
} from "../../../.github/scripts/github-pull-requests.mjs";

/** Answers `gh api` calls by their endpoint and records each call's arguments. */
function fakeApi(responses: Record<string, unknown>) {
    const calls: string[][] = [];
    const api: GhApi = (args) => {
        calls.push([...args]);
        const endpoint = args.find((arg) => arg.startsWith("repos/"))!;
        const response = responses[endpoint.split("?")[0]];
        if (response === undefined) throw new Error(`HTTP 404: ${endpoint}`);
        return typeof response === "string" ? response : JSON.stringify(response);
    };
    return { api, calls };
}

const pull = (overrides: Record<string, unknown> = {}) => ({
    number: 7,
    state: "open",
    title: "feat(bpmn-merge): offer the removed boundary events",
    body: "## Ships in\n\n- [x] `vscode`\n",
    head: { ref: "feat/merge", repo: { full_name: "o/r" } },
    base: { ref: "main", repo: { full_name: "o/r" } },
    merged_at: null,
    merge_commit_sha: null,
    ...overrides,
});

describe("a PR read for the check", () => {
    it("reads its title, body, head branch and state, and every file, renamed ones under both names", () => {
        const { api, calls } = fakeApi({
            "repos/o/r/pulls/7": pull(),
            "repos/o/r/pulls/7/files": "libs/a.ts\nlibs/new.ts\nlibs/old.ts\n",
        });

        expect(fetchPullRequest("o/r", 7, api)).toEqual({
            number: 7,
            state: "open",
            title: "feat(bpmn-merge): offer the removed boundary events",
            body: "## Ships in\n\n- [x] `vscode`\n",
            headBranch: "feat/merge",
            fromFork: false,
            files: ["libs/a.ts", "libs/new.ts", "libs/old.ts"],
        });
        expect(calls[1]).toEqual([
            "--paginate",
            "repos/o/r/pulls/7/files?per_page=100",
            "--jq",
            ".[] | .filename, (.previous_filename // empty)",
        ]);
    });

    it("says when the PR comes from a fork, also one whose repository is gone", () => {
        const files = { "repos/o/r/pulls/7/files": "" };
        const fork = {
            "repos/o/r/pulls/7": pull({ head: { ref: "x", repo: { full_name: "f/r" } } }),
        };
        const gone = { "repos/o/r/pulls/7": pull({ head: { ref: "x", repo: null } }) };

        expect(fetchPullRequest("o/r", 7, fakeApi({ ...fork, ...files }).api).fromFork).toBe(true);
        expect(fetchPullRequest("o/r", 7, fakeApi({ ...gone, ...files }).api).fromFork).toBe(true);
    });

    it("reads a null body as empty", () => {
        const { api } = fakeApi({
            "repos/o/r/pulls/7": pull({ body: null }),
            "repos/o/r/pulls/7/files": "",
        });

        expect(fetchPullRequest("o/r", 7, api).body).toBe("");
    });
});

describe("the merged PR of a commit on main", () => {
    const sha = "a1b2c3d4e5f6";
    const merged = pull({
        state: "closed",
        merged_at: "2026-11-18T10:00:00Z",
        merge_commit_sha: sha,
    });

    it("reads the PR the squash subject names, without the commit's PR list", () => {
        const { api, calls } = fakeApi({ "repos/o/r/pulls/7": merged });

        expect(mergedPullRequest("o/r", { sha, title: "feat: a (#7)" }, api)).toEqual({
            head: "feat/merge",
            body: "## Ships in\n\n- [x] `vscode`\n",
        });
        expect(calls).toHaveLength(1);
    });

    it("falls back to the commit's PR list when the named PR merged another commit", () => {
        const { api } = fakeApi({
            "repos/o/r/pulls/7": pull({ merged_at: "x", merge_commit_sha: "other" }),
            [`repos/o/r/commits/${sha}/pulls`]: [merged],
        });

        expect(mergedPullRequest("o/r", { sha, title: "feat: a (#7)" }, api)?.head).toBe(
            "feat/merge",
        );
    });

    it("falls back to the commit's PR list when the subject names no PR", () => {
        const { api } = fakeApi({ [`repos/o/r/commits/${sha}/pulls`]: [merged] });

        expect(mergedPullRequest("o/r", { sha, title: "feat: a" }, api)?.head).toBe("feat/merge");
    });

    it("finds no PR for a direct push", () => {
        const { api } = fakeApi({ [`repos/o/r/commits/${sha}/pulls`]: [] });

        expect(mergedPullRequest("o/r", { sha, title: "fix: b" }, api)).toBeNull();
    });
});
