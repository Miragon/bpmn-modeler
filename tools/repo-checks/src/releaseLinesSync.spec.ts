import { describe, expect, it } from "vitest";

import releaseLines from "../../../.github/release-lines.json";
import {
    checkPullRequest,
    checkSummary,
    writeAttributions,
    type GitDataApi,
} from "../../../.github/scripts/release-lines-sync.mjs";
import type {
    AttributionWrite,
    ReleaseLineRegistry,
} from "../../../.github/scripts/release-routing.mjs";

const registry: ReleaseLineRegistry = releaseLines;

describe("the check of a PR", () => {
    const mergeFeat = {
        title: "feat(bpmn-merge): offer the removed boundary events",
        files: ["libs/bpmn-merge/src/pickOutcome.ts", "libs/shared/src/lib/mergePaneMessages.ts"],
        headBranch: "feat/merge",
    };

    it("fails a shared feat without a declaration and suggests the lines its files reach", () => {
        const result = checkPullRequest({ ...mergeFeat, body: "" }, registry);

        expect(result.errors).toHaveLength(1);
        expect(result.derivedLines).toEqual(["vscode", "intellij", "orca"]);
        expect(result.suggestion).toContain("- [x] `orca`");
        expect(result.attribution.source).toBe("derived");
    });

    it("passes once the PR ticks the line that offers it", () => {
        const result = checkPullRequest(
            { ...mergeFeat, body: "## Ships in\n\n- [x] `vscode`\n" },
            registry,
        );

        expect(result.errors).toEqual([]);
        expect(result.attribution).toEqual({
            source: "declared",
            groups: [{ subject: mergeFeat.title, lines: ["vscode"] }],
        });
    });

    it("writes each error and the suggested block to the job summary", () => {
        expect(
            checkSummary({
                errors: ["first", "second"],
                suggestion: "## Ships in\n\n- [ ] `none`\n",
            }),
        ).toBe(
            [
                "### Validate release lines",
                "",
                "```text",
                "first",
                "```",
                "",
                "```text",
                "second",
                "```",
                "",
                "The lines the changed files reach, ready to paste under the PR body's Ships in:",
                "",
                "```markdown",
                "## Ships in",
                "",
                "- [ ] `none`",
                "```",
                "",
            ].join("\n"),
        );
    });

    it("writes the suggested block once when an error already carries it", () => {
        const block = "## Ships in\n\n- [x] `vscode`\n";
        const summary = checkSummary({ errors: [`declare it:\n\n${block}`], suggestion: block });

        expect(summary.split("## Ships in")).toHaveLength(2);
        expect(summary).not.toContain("ready to paste under");
    });

    it("writes no summary when the check passes", () => {
        expect(checkSummary({ errors: [], suggestion: "x" })).toBe("");
    });
});

/** Trees are content-addressed, as in Git: the same files give the same tree id. */
function fakeGitData(files: Record<string, string>) {
    const treeId = (tree: Record<string, string>) => JSON.stringify(Object.entries(tree).sort());
    const trees = new Map<string, Record<string, string>>([[treeId(files), files]]);
    const commits = new Map<string, { message: string; tree: string; parent: string }>([
        ["base", { message: "base", tree: treeId(files), parent: "" }],
    ]);
    const fastForwards: string[] = [];
    const api: GitDataApi = {
        treeOf: (commitSha) => commits.get(commitSha)!.tree,
        createTree: (baseTree, changed) => {
            const tree = { ...trees.get(baseTree) };
            for (const { path, content } of changed) tree[path] = content;
            trees.set(treeId(tree), tree);
            return treeId(tree);
        },
        createCommit: (commit) => {
            const sha = `c${commits.size}`;
            commits.set(sha, commit);
            return sha;
        },
        fastForward: (sha) => fastForwards.push(sha),
    };
    return { api, commits, fastForwards };
}

function write(message: string, path: string, content: string): AttributionWrite {
    return { sha: "s", subject: message, lines: ["line"], message, files: [{ path, content }] };
}

describe("writing the attribution commits", () => {
    it("chains each commit onto the one before and moves main once", () => {
        const { api, commits, fastForwards } = fakeGitData({ "release/a/ATTRIBUTION": "x" });

        writeAttributions(api, "base", [
            write("feat: a [sync 1111111]", "release/a/ATTRIBUTION", "1"),
            write("fix: b [sync 2222222]", "release/a/ATTRIBUTION", "2"),
        ]);

        expect(commits.get("c1")).toMatchObject({
            message: "feat: a [sync 1111111]",
            parent: "base",
        });
        expect(commits.get("c2")).toMatchObject({ message: "fix: b [sync 2222222]", parent: "c1" });
        expect(fastForwards).toEqual(["c2"]);
    });

    it("writes no commit that leaves the tree unchanged, which release-please would put on every line", () => {
        const { api, commits, fastForwards } = fakeGitData({ "release/a/ATTRIBUTION": "1" });

        const { unchanged } = writeAttributions(api, "base", [
            write("feat: a [sync 1111111]", "release/a/ATTRIBUTION", "1"),
            write("fix: b [sync 2222222]", "release/b/ATTRIBUTION", "2"),
        ]);

        expect([...commits.values()].map(({ message }) => message)).toEqual([
            "base",
            "fix: b [sync 2222222]",
        ]);
        expect(commits.get("c1")!.parent).toBe("base");
        expect(unchanged.map(({ message }) => message)).toEqual(["feat: a [sync 1111111]"]);
        expect(fastForwards).toEqual(["c1"]);
    });

    it("leaves main where it is when no write changes the tree", () => {
        const { api, fastForwards } = fakeGitData({ "release/a/ATTRIBUTION": "1" });

        writeAttributions(api, "base", [
            write("feat: a [sync 1111111]", "release/a/ATTRIBUTION", "1"),
        ]);

        expect(fastForwards).toEqual([]);
    });
});
