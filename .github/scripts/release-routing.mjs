#!/usr/bin/env node
// Decides which release lines a change reaches, from .github/release-lines.json.
// A file reaches every line whose `ships` globs match it, unless an `ignore`
// glob matches it first: no user receives a spec, a fixture or a README. Only
// feat and fix are attributed; a breaking `!` stays only on the lines whose
// `breaking` globs match a file the line ships. The sync, reconcile and audit
// modes (release-lines-sync.mjs) turn these decisions into attribution commits.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { matchesGlobs } from "./glob.mjs";

const CONVENTIONAL_TITLE = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?:/;
const ATTRIBUTED_TYPES = new Set(["feat", "fix"]);

function releasedFiles(files, registry) {
    return files.filter((file) => !matchesGlobs(registry.ignore, file));
}

function linesShipping(files, registry) {
    return registry.lines.filter((line) => files.some((file) => matchesGlobs(line.ships, file)));
}

/** The ids of the lines that ship one of the files, in the registry's order. */
export function derivedLines(files, registry) {
    return linesShipping(releasedFiles(files, registry), registry).map(({ id }) => id);
}

function breakingLines(files, registry) {
    const released = releasedFiles(files, registry);
    return registry.lines
        .filter((line) =>
            released.some(
                (file) => matchesGlobs(line.ships, file) && matchesGlobs(line.breaking, file),
            ),
        )
        .map(({ id }) => id);
}

function withoutBreakingMark(title) {
    return title.replace(/^([a-z]+(?:\([^)]*\))?)!:/, "$1:");
}

/** The lines a merged commit is listed on, grouped by the subject each group shows. */
export function resolveAttribution({ title, files }, registry) {
    const parsed = CONVENTIONAL_TITLE.exec(title);
    if (!parsed || !ATTRIBUTED_TYPES.has(parsed.groups.type)) {
        return { source: "derived", groups: [] };
    }
    const lines = derivedLines(files, registry);
    const breaking = parsed.groups.breaking ? breakingLines(files, registry) : [];
    const groups = [
        { subject: title, lines: lines.filter((id) => breaking.includes(id)) },
        {
            subject: withoutBreakingMark(title),
            lines: lines.filter((id) => !breaking.includes(id)),
        },
    ].filter((group) => group.lines.length > 0);
    return { source: "derived", groups };
}

const SHORT_SHA_LENGTH = 7;
const SYNC_SUFFIX = /\[sync (?<sha>[0-9a-f]{7,40})\]$/;
const RELEASE_BRANCH_PREFIX = "release-please--";
const RELEASE_TITLE = /^chore(?:\([^)]*\))?: release\b/;

function shortSha(sha) {
    return sha.slice(0, SHORT_SHA_LENGTH);
}

/** The sha an attribution commit names in its subject's `[sync <sha>]`. */
export function syncedSha(message) {
    return SYNC_SUFFIX.exec(message.split("\n")[0])?.groups.sha;
}

/** Why a commit on main is never routed: the sync's own commits and release-please's. */
export function skipReason({ title, pullRequestHead }) {
    if (syncedSha(title) !== undefined) return "attribution commit";
    if (pullRequestHead?.startsWith(RELEASE_BRANCH_PREFIX) || RELEASE_TITLE.test(title)) {
        return "release commit";
    }
    return undefined;
}

export function attributionMessage(subject, sha) {
    return `${subject} [sync ${shortSha(sha)}]`;
}

/** release-please releases a line from the commits that change its folder; this file is that change. */
export function attributionFile(componentPath, sha) {
    return {
        path: `${componentPath}/ATTRIBUTION`,
        content: [
            "# Written by sync-release-lines.yml; do not edit by hand.",
            "# The last commit attributed to this release line.",
            `bundledCommit=${sha}`,
            "",
        ].join("\n"),
    };
}

/**
 * Each commit since the oldest tag once, oldest first, with the lines whose
 * tag it follows. Every window is a suffix of the same first-parent history.
 */
export function commitsSinceTags(windows) {
    const longest = windows.reduce(
        (widest, window) => (window.shas.length > widest.length ? window.shas : widest),
        [],
    );
    return longest.map((sha) => ({
        sha,
        unreleasedLines: windows.filter(({ shas }) => shas.includes(sha)).map(({ id }) => id),
    }));
}

function isAttributed(existing, sha, id) {
    return existing.some(
        (attribution) => sha.startsWith(attribution.sha) && attribution.lines.includes(id),
    );
}

/**
 * The decision for every commit and the attribution commits still to write,
 * one per line group, in the commits' order. `existing` may name a commit by
 * its short sha, as an attribution commit's subject does.
 */
export function planAttributions(commits, existing, registry) {
    const componentPathOf = new Map(
        registry.lines.map(({ id, componentPath }) => [id, componentPath]),
    );
    const decisions = [];
    const writes = [];
    for (const commit of commits) {
        const decision = { sha: commit.sha, title: commit.title, lines: [], attributed: [] };
        decision.skipped = skipReason(commit);
        decision.attributable = ATTRIBUTED_TYPES.has(
            CONVENTIONAL_TITLE.exec(commit.title)?.groups.type,
        );
        decisions.push(decision);
        if (decision.skipped !== undefined) continue;
        for (const group of resolveAttribution(commit, registry).groups) {
            const lines = group.lines.filter((id) => commit.unreleasedLines?.includes(id) ?? true);
            const missing = lines.filter((id) => !isAttributed(existing, commit.sha, id));
            decision.lines.push(...missing);
            decision.attributed.push(...lines.filter((id) => !missing.includes(id)));
            if (missing.length === 0) continue;
            writes.push({
                sha: commit.sha,
                subject: group.subject,
                lines: missing,
                message: attributionMessage(group.subject, commit.sha),
                files: missing.map((id) => attributionFile(componentPathOf.get(id), commit.sha)),
            });
        }
    }
    return { decisions, writes };
}

/** The attributions a line still lacks, per commit, in the commits' order. */
export function missingAttributions(commits, existing, registry) {
    return planAttributions(commits, existing, registry).writes.map(({ sha, subject, lines }) => ({
        sha,
        subject,
        lines,
    }));
}

function decisionText({ skipped, attributable, lines, attributed }) {
    if (skipped !== undefined) return `skipped: ${skipped}`;
    if (!attributable) return "none: not a feat or fix";
    if (lines.length === 0 && attributed.length === 0) return "none: reaches no line";
    return [
        lines.length > 0 ? `adds ${lines.join(", ")}` : undefined,
        attributed.length > 0 ? `has ${attributed.join(", ")}` : undefined,
    ]
        .filter((part) => part !== undefined)
        .join("; ");
}

/** A Markdown table of the decisions, for a workflow's step summary. */
export function routingSummary(heading, decisions) {
    if (decisions.length === 0) return `### ${heading}\n\nNo commit to route.\n`;
    return [
        `### ${heading}`,
        "",
        "| Commit | Title | Release lines |",
        "| --- | --- | --- |",
        ...decisions.map(
            (decision) =>
                `| ${shortSha(decision.sha)} | ${decision.title.replaceAll("|", "\\|")} | ${decisionText(decision)} |`,
        ),
        "",
    ].join("\n");
}

/** Empty when nothing is missing; otherwise each gap and the command that fills it. */
export function auditReport(writes, reconcileCommand) {
    if (writes.length === 0) return "";
    return [
        ...writes.map(
            ({ sha, subject, lines }) =>
                `${shortSha(sha)} ${subject} lacks its attribution on ${lines.join(", ")}`,
        ),
        "",
        `Add the missing attributions: ${reconcileCommand}`,
    ].join("\n");
}

const USAGE = [
    "release-routing: usage:",
    "  derive <files…>",
    "  attribute --title <title> <files…>",
    "  sync <before>..<sha> [--dry-run]",
    "  reconcile [--dry-run]",
    "  audit",
].join("\n");

async function main(args) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const registry = JSON.parse(
        readFileSync(resolve(repoRoot, ".github/release-lines.json"), "utf8"),
    );
    const [mode, ...rest] = args;
    if (mode === "derive") {
        stdout.write(`${JSON.stringify(derivedLines(rest, registry))}\n`);
    } else if (mode === "attribute" && rest[0] === "--title" && rest[1] !== undefined) {
        const [, title, ...files] = rest;
        stdout.write(`${JSON.stringify(resolveAttribution({ title, files }, registry))}\n`);
    } else if (["sync", "reconcile", "audit"].includes(mode)) {
        const { runReleaseSync } = await import("./release-lines-sync.mjs");
        await runReleaseSync({ mode, args: rest, registry, repoRoot });
    } else {
        throw new Error(USAGE);
    }
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
    main(argv.slice(2)).catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
