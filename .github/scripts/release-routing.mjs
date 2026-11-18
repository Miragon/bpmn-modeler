// Decides which release lines a change reaches, from .github/release-lines.json.
// A file reaches every line whose `ships` globs match it, unless an `ignore`
// glob matches it first: no user receives a spec, a fixture or a README. Only
// feat and fix are attributed. A PR may tick its lines under "Ships in"; the
// declaration wins, because the files say what a line bundles, not what it
// offers. A breaking `!` stays only on the lines whose `breaking` globs match a
// file the line ships. release-lines-sync.mjs turns these decisions into
// attribution commits and runs the PR check.
import { matchesGlobs } from "./glob.mjs";

const CONVENTIONAL_TITLE = /^(?<type>[a-z]+)(?:\([^)]*\))?(?<breaking>!)?:/;
const ATTRIBUTED_SUBJECT = /^(?:feat|fix)(?:\([^)]*\))?!?: \S/;
const PR_NUMBER_SUFFIX = / \(#\d+\)$/;
/** The only types that reach a line, so the only changelog sections that can fill. */
export const ATTRIBUTED_TYPES = Object.freeze(["feat", "fix"]);
/** The Ships in box for a change no released user gets. */
export const NO_LINE = "none";

export function isAttributedType(title) {
    return ATTRIBUTED_TYPES.includes(CONVENTIONAL_TITLE.exec(title)?.groups.type);
}

function isBreaking(title) {
    return CONVENTIONAL_TITLE.exec(title)?.groups.breaking !== undefined;
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

function withoutBreakingMark(title) {
    return title.replace(/^([a-z]+(?:\([^)]*\))?)!:/, "$1:");
}

function codeList(ids) {
    return ids.map((id) => `\`${id}\``).join(", ");
}

function choiceList(ids) {
    const codes = ids.map((id) => `\`${id}\``);
    return `${codes.slice(0, -1).join(", ")} or ${codes.at(-1)}`;
}

const HTML_COMMENT = /<!--[\s\S]*?(?:-->|$)/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SECTION_HEADING = /^#{1,6}\s+ships in\s*:?\s*#*\s*$/i;
const HEADING = /^#{1,6}\s/;
const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/;
const BOX_ITEM = /^`?(?<id>[A-Za-z0-9][\w.-]*)`?(?:\s+as\s+`(?<wording>[^`]*)`)?/;

/** The body's lines a reader sees: no HTML comment, no fenced code. */
function visibleLines(body) {
    const text = (body ?? "").replace(/\r\n?/g, "\n").replace(HTML_COMMENT, "");
    let fence;
    return text.split("\n").filter((line) => {
        const marker = FENCE.exec(line)?.[1];
        if (fence !== undefined) {
            if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = undefined;
            return false;
        }
        if (marker !== undefined) fence = marker;
        return marker === undefined;
    });
}

function shipsInSection(body) {
    const lines = visibleLines(body);
    const start = lines.findIndex((line) => SECTION_HEADING.test(line));
    if (start === -1) return undefined;
    const next = lines.findIndex((line, index) => index > start && HEADING.test(line));
    return lines.slice(start + 1, next === -1 ? undefined : next);
}

function tickedItem(line) {
    const box = CHECKBOX.exec(line);
    if (box === null || box[1] === " ") return undefined;
    return BOX_ITEM.exec(box[2])?.groups;
}

/** The lines a PR body ticks under "Ships in", with each line's own wording. */
export function parseShipsIn(body, registry) {
    const section = shipsInSection(body);
    const declaration = { found: section !== undefined, none: false, wording: {}, errors: [] };
    const ids = registry.lines.map(({ id }) => id);
    const ticked = new Set();
    for (const item of (section ?? []).map(tickedItem)) {
        if (item === undefined) continue;
        if (item.id === NO_LINE) declaration.none = true;
        else if (!ids.includes(item.id)) {
            declaration.errors.push(
                `\`${item.id}\` under Ships in is no release line; tick one of ${choiceList([...ids, NO_LINE])}.`,
            );
        } else {
            ticked.add(item.id);
            if (item.wording !== undefined) declaration.wording[item.id] = item.wording;
        }
    }
    return { ...declaration, lines: ids.filter((id) => ticked.has(id)) };
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
 * The lines a merged commit is listed on, grouped by the subject each group
 * shows: the lines its PR body ticks, else the lines its files reach. A ticked
 * line that ships none of the files is left out.
 */
export function resolveAttribution({ title, files, body }, registry) {
    if (!isAttributedType(title)) return { source: "derived", groups: [] };
    const declaration = parseShipsIn(body, registry);
    const shipped = derivedLines(files, registry);
    const breaking = isBreaking(title) ? breakingLines(files, registry) : [];
    const subjectOf = (id) => (breaking.includes(id) ? title : withoutBreakingMark(title));
    if (declaration.lines.length > 0) {
        const declaredSubjectOf = (id) =>
            declaration.wording[id] === undefined
                ? subjectOf(id)
                : withPrNumberOf(title, declaration.wording[id]);
        const lines = declaration.lines.filter((id) => shipped.includes(id));
        return { source: "declared", groups: groupBySubject(lines, declaredSubjectOf) };
    }
    if (declaration.none) return { source: "none", groups: [] };
    return { source: "derived", groups: groupBySubject(shipped, subjectOf) };
}

/** The "Ships in" block to paste, with the lines the files reach ticked. */
export function suggest({ files, registry }) {
    const shipped = derivedLines(files, registry);
    return [
        "## Ships in",
        "",
        ...registry.lines.map(({ id }) => `- [${shipped.includes(id) ? "x" : " "}] \`${id}\``),
        `- [ ] \`${NO_LINE}\``,
        "",
    ].join("\n");
}

function undeclaredError(title, files, registry) {
    const { type } = CONVENTIONAL_TITLE.exec(title).groups;
    return [
        `This ${type} reaches ${codeList(derivedLines(files, registry))} by its files, so the PR must say which of them ships it.`,
        'Under "Ships in", tick each line whose users get the change, judged by wiring (does that line offer the feature?), not by the files it bundles.',
        `Tick \`${NO_LINE}\` when no released user gets it, such as a fix to a feature no release shipped yet.`,
        "Ready to paste, with the lines its files reach ticked:",
        "",
        suggest({ files, registry }),
    ].join("\n");
}

function declarationErrors(declaration, shipped) {
    const errors = [...declaration.errors];
    if (declaration.none && declaration.lines.length > 0) {
        errors.push(
            `\`${NO_LINE}\` is ticked together with ${codeList(declaration.lines)} under Ships in; tick either \`${NO_LINE}\` or the lines.`,
        );
    }
    for (const id of declaration.lines.filter((line) => !shipped.includes(line))) {
        errors.push(
            `\`${id}\` is ticked under Ships in, but it ships none of the changed files; untick it.`,
        );
    }
    for (const [id, wording] of Object.entries(declaration.wording)) {
        if (ATTRIBUTED_SUBJECT.test(wording)) continue;
        errors.push(
            `The wording of \`${id}\` under Ships in, \`${wording}\`, is no feat or fix subject; write it as \`fix(<scope>): <subject>\` or \`feat(<scope>): <subject>\`.`,
        );
    }
    return errors;
}

function attributedErrors({ title, files, registry }, declaration, shipped) {
    if (!isAttributedType(title)) return [];
    const declared = declaration.lines.length > 0 || declaration.none;
    if (!declared) return shipped.length >= 2 ? [undeclaredError(title, files, registry)] : [];
    if (!isBreaking(title)) return [];
    return breakingLines(files, registry)
        .filter((id) => !declaration.lines.includes(id))
        .map(
            (id) =>
                `The breaking change touches what \`${id}\` guarantees (its breaking globs); tick \`${id}\` under Ships in.`,
        );
}

/** What is wrong with a PR's title, body and files for the release routing, each with what to do. */
export function validate(pullRequest) {
    const { body, files, registry, headBranch } = pullRequest;
    const edited = headBranch?.startsWith(RELEASE_BRANCH_PREFIX)
        ? []
        : files.filter((file) => file.startsWith("release/"));
    const declaration = parseShipsIn(body, registry);
    const shipped = derivedLines(files, registry);
    return [
        ...(edited.length > 0
            ? [
                  `This PR changes ${edited.join(", ")}; only the sync workflow and the release PR write release/**. Revert the change.`,
              ]
            : []),
        ...declarationErrors(declaration, shipped),
        ...attributedErrors(pullRequest, declaration, shipped),
    ];
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
