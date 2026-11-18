#!/usr/bin/env node
// The command line and I/O of the release routing: main's history and tags
// from the local clone, merged pull requests and existing attributions from
// the GitHub API, attribution commits through the Git Data API. The decisions
// are the pure functions of release-routing.mjs.
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, env, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
    auditReport,
    commitsSinceTags,
    derivedLines,
    planAttributions,
    resolveAttribution,
    routingSummary,
    skipReason,
    syncedSha,
} from "./release-routing.mjs";

const TARGET_BRANCH = "main";
const MAX_ATTEMPTS = 5;
const NO_COMMIT = /^0+$/;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function git(repoRoot, args) {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function gitLines(repoRoot, args) {
    return git(repoRoot, args)
        .split("\n")
        .filter((line) => line !== "");
}

function gh(args, input) {
    return execFileSync("gh", ["api", ...args], {
        encoding: "utf8",
        input: input === undefined ? undefined : JSON.stringify(input),
        stdio: ["pipe", "pipe", "pipe"],
    });
}

function ghJson(args, input) {
    return JSON.parse(gh(input === undefined ? args : [...args, "--input", "-"], input));
}

function readJson(repoRoot, path) {
    return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

function readCommit(repoRoot, sha) {
    return {
        sha,
        title: git(repoRoot, ["log", "-1", "--format=%s", sha]),
        // Both sides of a rename: a file moved out of a shipped folder changes that line too.
        files: gitLines(repoRoot, ["diff", "--name-only", "--no-renames", `${sha}^1`, sha]),
        date: git(repoRoot, ["log", "-1", "--format=%cI", sha]),
    };
}

function mergedPullRequestHead(repo, sha) {
    const pulls = ghJson([`repos/${repo}/commits/${sha}/pulls`]);
    const merged =
        pulls.find((pull) => pull.merge_commit_sha === sha) ??
        pulls.find((pull) => pull.merged_at && pull.base.ref === TARGET_BRANCH);
    return merged?.head.ref;
}

function pushedShas(repoRoot, range) {
    const [before, sha] = range.split("..");
    if (!sha) throw new Error(`release-lines-sync: sync takes <before>..<sha>, not ${range}`);
    return NO_COMMIT.test(before)
        ? [sha]
        : gitLines(repoRoot, ["rev-list", "--first-parent", "--reverse", `${before}..${sha}`]);
}

function shasSinceTags(repoRoot, registry) {
    const config = readJson(repoRoot, "release-please-config.json");
    const manifest = readJson(repoRoot, ".release-please-manifest.json");
    const windows = registry.lines.map(({ id, componentPath }) => {
        const tag = `${config.packages[componentPath].component}-v${manifest[componentPath]}`;
        return {
            id,
            shas: gitLines(repoRoot, ["rev-list", "--first-parent", "--reverse", `${tag}..HEAD`]),
        };
    });
    return commitsSinceTags(windows);
}

function existingAttributions(repo, head, registry, since) {
    return registry.lines.flatMap(({ id, componentPath }) =>
        gh([
            "--paginate",
            `repos/${repo}/commits?sha=${head}&path=${componentPath}&since=${since}&per_page=100`,
            "--jq",
            '.[].commit.message | split("\\n")[0]',
        ])
            .split("\n")
            .map(syncedSha)
            .filter((sha) => sha !== undefined)
            .map((sha) => ({ sha, lines: [id] })),
    );
}

function gitDataApi(repo) {
    return {
        treeOf: (commitSha) => ghJson([`repos/${repo}/git/commits/${commitSha}`]).tree.sha,
        createTree: (baseTree, files) =>
            ghJson(["-X", "POST", `repos/${repo}/git/trees`], {
                base_tree: baseTree,
                tree: files.map(({ path, content }) => ({
                    path,
                    mode: "100644",
                    type: "blob",
                    content,
                })),
            }).sha,
        createCommit: ({ message, tree, parent }) =>
            ghJson(["-X", "POST", `repos/${repo}/git/commits`], {
                message,
                tree,
                parents: [parent],
            }).sha,
        fastForward: (sha) =>
            ghJson(["-X", "PATCH", `repos/${repo}/git/refs/heads/${TARGET_BRANCH}`], {
                sha,
                force: false,
            }),
    };
}

/**
 * Chains the attribution commits onto `base` and moves main to the last one.
 * A write that leaves the tree as it was is dropped: release-please puts a
 * commit without files on every line.
 */
export function writeAttributions(api, base, writes) {
    let parent = base;
    let tree = api.treeOf(base);
    const unchanged = [];
    for (const write of writes) {
        const nextTree = api.createTree(tree, write.files);
        if (nextTree === tree) {
            unchanged.push(write);
            continue;
        }
        tree = nextTree;
        parent = api.createCommit({ message: write.message, tree, parent });
    }
    if (parent !== base) api.fastForward(parent);
    return { unchanged };
}

function isNotFastForward(error) {
    return /not a fast.?forward/i.test(`${error.stderr ?? ""}${error.message}`);
}

function report(text) {
    stdout.write(`${text}\n`);
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

function parseOptions(mode, args) {
    const dryRun = args.includes("--dry-run") || mode === "audit";
    const repoIndex = args.indexOf("--repo");
    const repo = repoIndex === -1 ? env.GITHUB_REPOSITORY : args[repoIndex + 1];
    if (!repo)
        throw new Error("release-lines-sync: pass --repo <owner/name> or set GITHUB_REPOSITORY");
    const range = args.find((arg) => arg.includes(".."));
    return { dryRun, repo, range };
}

function readCommits({ mode, repoRoot, registry, range, repo }) {
    const listed =
        mode === "sync"
            ? pushedShas(repoRoot, range).map((sha) => ({ sha }))
            : shasSinceTags(repoRoot, registry);
    return listed.map(({ sha, unreleasedLines }) => {
        const commit = { ...readCommit(repoRoot, sha), unreleasedLines };
        // A commit its subject already skips needs no pull request lookup.
        return skipReason(commit) === undefined
            ? { ...commit, pullRequestHead: mergedPullRequestHead(repo, sha) }
            : commit;
    });
}

function headingOf(mode, range, dryRun) {
    const headings = {
        sync: `Sync of ${range}`,
        reconcile: "Reconcile since each line's last tag",
        audit: "Attributions since each line's last tag",
    };
    return `${headings[mode]}${dryRun && mode !== "audit" ? " (dry run)" : ""}`;
}

function runReleaseSync({ mode, args, registry, repoRoot }) {
    const { dryRun, repo, range } = parseOptions(mode, args);
    const commits = readCommits({ mode, repoRoot, registry, range, repo });
    const heading = headingOf(mode, range, dryRun);
    if (commits.length === 0) {
        report(routingSummary(heading, []));
        return;
    }
    const oldest = Math.min(...commits.map(({ date }) => Date.parse(date)));
    const since = new Date(oldest - ONE_DAY_MS).toISOString();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // The head is read before the attributions, so a write that lands in between fails the fast-forward.
        const head = ghJson([`repos/${repo}/git/ref/heads/${TARGET_BRANCH}`]).object.sha;
        const existing = existingAttributions(repo, head, registry, since);
        const { decisions, writes } = planAttributions(commits, existing, registry);
        if (mode === "audit") {
            report(routingSummary(heading, decisions));
            const gaps = auditReport(
                writes,
                `gh workflow run sync-release-lines.yml --repo ${repo} --ref ${TARGET_BRANCH} -f reconcile=true`,
            );
            if (gaps !== "") throw new Error(gaps);
            stdout.write(
                "Every feat and fix since each line's last tag carries its attribution.\n",
            );
            return;
        }
        if (dryRun || writes.length === 0) {
            report(routingSummary(heading, decisions));
            writes.forEach(({ message, lines }) =>
                stdout.write(`would write: ${message} -> ${lines.join(", ")}\n`),
            );
            return;
        }
        try {
            const { unchanged } = writeAttributions(gitDataApi(repo), head, writes);
            report(routingSummary(heading, decisions));
            unchanged.forEach(({ message }) =>
                stdout.write(`not written, the file already says so: ${message}\n`),
            );
            return;
        } catch (error) {
            if (!isNotFastForward(error) || attempt === MAX_ATTEMPTS) throw error;
            stdout.write(`${TARGET_BRANCH} moved; attempt ${attempt + 1} of ${MAX_ATTEMPTS}\n`);
        }
    }
}

const USAGE = [
    "release-lines-sync: usage:",
    "  derive <files…>",
    "  attribute --title <title> <files…>",
    "  sync <before>..<sha> [--dry-run] [--repo <owner/name>]",
    "  reconcile [--dry-run] [--repo <owner/name>]",
    "  audit [--repo <owner/name>]",
].join("\n");

function main(args) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const registry = readJson(repoRoot, ".github/release-lines.json");
    const [mode, ...rest] = args;
    if (mode === "derive") {
        stdout.write(`${JSON.stringify(derivedLines(rest, registry))}\n`);
    } else if (mode === "attribute" && rest[0] === "--title" && rest[1] !== undefined) {
        const [, title, ...files] = rest;
        stdout.write(`${JSON.stringify(resolveAttribution({ title, files }, registry))}\n`);
    } else if (["sync", "reconcile", "audit"].includes(mode)) {
        runReleaseSync({ mode, args: rest, registry, repoRoot });
    } else {
        throw new Error(USAGE);
    }
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
    try {
        main(argv.slice(2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
