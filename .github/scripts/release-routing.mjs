// Decides which release lines a change reaches, from .github/release-lines.json.
// A file reaches every line whose `ships` globs match it, unless an `ignore`
// glob matches it first: no user receives a spec, a fixture or a README. Only
// feat and fix are attributed. A PR may tick its lines under "Ships in"
// (release-declaration.mjs); the declaration wins, because the files say what a
// line bundles, not what it offers. A breaking `!` stays only on the lines whose
// `breaking` globs match a file the line ships, also under a line's own wording.
// release-check.mjs validates a PR against these rules; release-lines-sync.mjs
// turns the decisions into attribution commits.
import { matchesGlobs } from "./glob.mjs";
import { parseShipsIn, shipsInCandidates } from "./release-declaration.mjs";

const CONVENTIONAL_TITLE = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?:/;
const ATTRIBUTED_SUBJECT = /^(?:feat|fix)(?:\([^)]*\))?!?: \S/;
const PR_NUMBER_SUFFIX = / \(#(?<number>\d+)\)$/;
/** The only types that reach a line, so the only changelog sections that can fill. */
export const ATTRIBUTED_TYPES = Object.freeze(["feat", "fix"]);

export function isAttributedType(title) {
    return ATTRIBUTED_TYPES.includes(CONVENTIONAL_TITLE.exec(title)?.groups.type);
}

/** Whether a subject is a feat or fix subject a changelog lists, `!` allowed. */
export function isAttributedSubject(subject) {
    return ATTRIBUTED_SUBJECT.test(subject);
}

export function isBreaking(subject) {
    return CONVENTIONAL_TITLE.exec(subject)?.groups.breaking !== undefined;
}

/** The PR a squash commit names at the end of its subject, as `(#123)`. */
export function pullRequestNumber(title) {
    const number = PR_NUMBER_SUFFIX.exec(title)?.groups.number;
    return number === undefined ? undefined : Number(number);
}

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

/** The lines a breaking title marks breaking; none for a title without `!`. */
export function breakingLinesOf(title, files, registry) {
    return isBreaking(title) ? breakingLines(files, registry) : [];
}

function withoutBreakingMark(subject) {
    return subject.replace(/^([a-z]+(?:\([^)]*\))?)!:/, "$1:");
}

function withBreakingMark(subject, breaking) {
    const unmarked = withoutBreakingMark(subject);
    return breaking ? unmarked.replace(/^([a-z]+(?:\([^)]*\))?):/, "$1!:") : unmarked;
}

function groupBySubject(lines, subjectOf) {
    const groups = [];
    for (const id of lines) {
        const subject = subjectOf(id);
        const group = groups.find((candidate) => candidate.subject === subject);
        if (group) group.lines.push(id);
        else groups.push({ subject, lines: [id] });
    }
    return groups;
}

/** A line's own wording links the same PR as the title the squash merge gave the commit. */
function withPrNumberOf(title, wording) {
    const suffix = PR_NUMBER_SUFFIX.exec(title)?.[0];
    return suffix === undefined || PR_NUMBER_SUFFIX.test(wording) ? wording : `${wording}${suffix}`;
}

/**
 * Each line's subject: its own wording when that is a feat or fix subject,
 * else the title. The breaking mark comes from the title and the line's
 * breaking globs, never from the wording, so a wording can neither drop nor
 * add a major bump.
 */
function subjectOfLine(title, files, registry, declaration) {
    const breaking = breakingLinesOf(title, files, registry);
    return (id) => {
        const wording = declaration.wording[id];
        const subject =
            wording !== undefined && isAttributedSubject(wording)
                ? withPrNumberOf(title, wording)
                : title;
        return withBreakingMark(subject, breaking.includes(id));
    };
}

/**
 * The lines a merged commit is listed on, grouped by the subject each group
 * shows: the lines its PR body ticks, else the lines its files reach. A ticked
 * line that ships none of the files is left out.
 */
export function resolveAttribution({ title, files, body }, registry) {
    if (!isAttributedType(title)) return { source: "derived", groups: [] };
    const declaration = parseShipsIn(body, registry);
    const shipped = derivedLines(files, registry);
    const subjectOf = subjectOfLine(title, files, registry, declaration);
    if (declaration.lines.length > 0) {
        const lines = declaration.lines.filter((id) => shipped.includes(id));
        return { source: "declared", groups: groupBySubject(lines, subjectOf) };
    }
    if (declaration.none) return { source: "none", groups: [] };
    return { source: "derived", groups: groupBySubject(shipped, subjectOf) };
}

/** The "Ships in" boxes to put in: the lines the files reach as unticked candidates. */
export function suggest({ files, registry }) {
    return shipsInCandidates(derivedLines(files, registry), registry);
}

const SHORT_SHA_LENGTH = 7;
const SYNC_SUFFIX = /\[sync (?<sha>[0-9a-f]{7,40})\]$/;
const RELEASE_BRANCH_PREFIX = "release-please--";
const RELEASE_TITLE = /^chore(?:\([^)]*\))?: release\b/;

/** The branch of the one combined release PR (`separate-pull-requests: false`). */
export function releaseBranchOf(targetBranch) {
    return `${RELEASE_BRANCH_PREFIX}branches--${targetBranch}`;
}

function shortSha(sha) {
    return sha.slice(0, SHORT_SHA_LENGTH);
}

/** The sha an attribution commit names in its subject's `[sync <sha>]`. */
export function syncedSha(message) {
    return SYNC_SUFFIX.exec(message.split("\n")[0])?.groups.sha;
}

/** Why a commit on main is never routed: the sync's own commits and release-please's. */
export function skipReason({ title, pullRequest }) {
    if (syncedSha(title) !== undefined) return "attribution commit";
    if (pullRequest?.head.startsWith(RELEASE_BRANCH_PREFIX) || RELEASE_TITLE.test(title)) {
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
 * its short sha, as an attribution commit's subject does. A commit's lines come
 * from its merged PR's body as it reads now.
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
        decision.attributable = isAttributedType(commit.title);
        decisions.push(decision);
        if (decision.skipped !== undefined) continue;
        const attribution = resolveAttribution(
            { ...commit, body: commit.pullRequest?.body },
            registry,
        );
        decision.source = attribution.source;
        decision.pullRequestFound = commit.pullRequest !== null;
        for (const group of attribution.groups) {
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

function sourceNote({ source, pullRequestFound }) {
    if (source === "declared") return " (declared)";
    return pullRequestFound === false ? " (derived: no PR found)" : "";
}

function decisionText(decision) {
    const { skipped, attributable, source, lines, attributed } = decision;
    if (skipped !== undefined) return `skipped: ${skipped}`;
    if (!attributable) return "none: not a feat or fix";
    if (source === "none") return "none: the PR ships it to none";
    if (lines.length === 0 && attributed.length === 0) return "none: reaches no line";
    const parts = [
        lines.length > 0 ? `adds ${lines.join(", ")}` : undefined,
        attributed.length > 0 ? `has ${attributed.join(", ")}` : undefined,
    ];
    return `${parts.filter((part) => part !== undefined).join("; ")}${sourceNote(decision)}`;
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
