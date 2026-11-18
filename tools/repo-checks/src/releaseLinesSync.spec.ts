import { describe, expect, it } from "vitest";

import {
    writeAttributions,
    type GitDataApi,
} from "../../../.github/scripts/release-lines-sync.mjs";
import type { AttributionWrite } from "../../../.github/scripts/release-routing.mjs";

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
