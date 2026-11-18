#!/usr/bin/env node
// Chooses the VS Code smoke suites for a change and spreads them over runner
// jobs, from the registry in .github/vscode-smoke-suites.json. A changed file
// selects the suites of the first rule it matches; a file no rule knows
// selects every suite, so a new folder is covered until a rule narrows it.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { matchesGlobs } from "./glob.mjs";

const SUITE_FOLDER = "apps/vscode-plugin/test/smoke";
const SUITE_FILE = /^apps\/vscode-plugin\/test\/smoke\/([^/]+)\.smoke\.test\.ts$/;
/** The pull request files API lists no more, so a longer change is not known in full. */
export const LISTED_FILES_LIMIT = 3000;

/** The suites a change runs, in the registry's order. */
export function selectSuites(registry, changedFiles) {
    const allSuites = Object.keys(registry.suites);
    if (changedFiles.length >= LISTED_FILES_LIMIT) return allSuites;
    const selected = new Set();
    for (const file of changedFiles) {
        const ownSuite = SUITE_FILE.exec(file)?.[1];
        if (ownSuite !== undefined && ownSuite in registry.suites) {
            selected.add(ownSuite);
            continue;
        }
        if (matchesGlobs(registry.ignore, file)) continue;
        const rule = registry.rules.find(({ paths }) => matchesGlobs(paths, file));
        for (const suite of rule ? [...registry.baseline, ...rule.suites] : allSuites) {
            selected.add(suite);
        }
    }
    return allSuites.filter((suite) => selected.has(suite));
}

/**
 * Spreads the suites over jobs of about `jobSeconds` each, at most `maxJobs`:
 * every job pays its own install and build, so a few short suites share one.
 */
export function planJobs(registry, suites) {
    if (suites.length === 0) return [];
    const secondsOf = (suite) => registry.suites[suite].seconds;
    const total = suites.reduce((sum, suite) => sum + secondsOf(suite), 0);
    const jobCount = Math.min(
        registry.maxJobs,
        suites.length,
        Math.max(1, Math.ceil(total / registry.jobSeconds)),
    );
    const jobs = Array.from({ length: jobCount }, () => ({ seconds: 0, suites: [] }));
    for (const suite of [...suites].sort((left, right) => secondsOf(right) - secondsOf(left))) {
        const shortest = jobs.reduce((least, job) => (job.seconds < least.seconds ? job : least));
        shortest.suites.push(suite);
        shortest.seconds += secondsOf(suite);
    }
    return jobs.map((job, index) => ({
        id: String(index + 1),
        name: job.suites.join(", "),
        // Whole file paths: a bare name would also match a suite that contains it.
        files: job.suites.map((suite) => `test/smoke/${suite}.smoke.test.ts`).join(" "),
    }));
}

export function suiteFile(suite) {
    return `${SUITE_FOLDER}/${suite}.smoke.test.ts`;
}

function fail(message) {
    throw new Error(`vscode-smoke-plan: ${message}`);
}

function main(args) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const registry = JSON.parse(
        readFileSync(resolve(repoRoot, ".github/vscode-smoke-suites.json"), "utf8"),
    );
    const [mode, value] = args;
    let suites;
    if (mode === "--all") {
        suites = Object.keys(registry.suites);
    } else if (mode === "--suites") {
        suites = (value ?? "").split(/[\s,]+/).filter(Boolean);
        const unknown = suites.filter((suite) => !(suite in registry.suites));
        if (unknown.length > 0) {
            fail(
                `unknown suite ${unknown.join(", ")}; known: ${Object.keys(registry.suites).join(", ")}`,
            );
        }
    } else if (mode === "--changed-files" && value !== undefined) {
        const changedFiles = readFileSync(value, "utf8").split("\n").filter(Boolean);
        suites = selectSuites(registry, changedFiles);
    } else {
        fail("usage: --all | --suites <names> | --changed-files <file with one path per line>");
    }
    stdout.write(`${JSON.stringify({ suites, jobs: planJobs(registry, suites) })}\n`);
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) main(argv.slice(2));
