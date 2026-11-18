#!/usr/bin/env node
// Decides which release lines a change reaches, from .github/release-lines.json.
// A file reaches every line whose `ships` globs match it, unless an `ignore`
// glob matches it first: no user receives a spec, a fixture or a README. Only
// feat and fix are attributed; a breaking `!` stays only on the lines whose
// `breaking` globs match a file the line ships.
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

/** The attributions a line still lacks, per commit, in the commits' order. */
export function missingAttributions(commits, existing, registry) {
    const attributed = new Map();
    for (const { sha, lines } of existing) {
        attributed.set(sha, new Set([...(attributed.get(sha) ?? []), ...lines]));
    }
    return commits.flatMap((commit) =>
        resolveAttribution(commit, registry).groups.flatMap(({ subject, lines }) => {
            const missing = lines.filter((id) => !attributed.get(commit.sha)?.has(id));
            return missing.length > 0 ? [{ sha: commit.sha, subject, lines: missing }] : [];
        }),
    );
}

function main(args) {
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
    } else {
        throw new Error(
            "release-routing: usage: derive <files…> | attribute --title <title> <files…>",
        );
    }
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) main(argv.slice(2));
