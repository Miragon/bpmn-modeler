#!/usr/bin/env node
// PostToolUse hook on Bash: after `gh pr create`, or a `gh pr edit` of the
// title or body, reads the open PR as the "Validate release lines" job does
// and checks its "Ships in" boxes with release-check.mjs. A feat or fix that
// reaches two or more lines with nothing ticked is blocked; ticked boxes get a
// request to confirm them by wiring. Fails open: any error, a missing gh, no
// network, a closed PR or another repository's PR exits silently.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, stdin, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fetchPullRequest } from "../../.github/scripts/github-pull-requests.mjs";
import { needsDeclaration, validate } from "../../.github/scripts/release-check.mjs";
import {
    isDeclared,
    NO_LINE,
    parseShipsIn,
    wiringQuestion,
} from "../../.github/scripts/release-declaration.mjs";
import { derivedLines, isAttributedType } from "../../.github/scripts/release-routing.mjs";

// Under the hook's 20 s timeout, so a slow network fails open instead of timing out.
const GH_BUDGET_MS = 15000;
const OPERATORS = ["&&", "||", ";;", "$(", "|", ";", "&", "(", ")", "\n", "`"];
// gh pr edit flags that set the title or body, the only edits that change the check.
const TEXT_FLAGS = new Set(["-t", "--title", "-b", "--body", "-F", "--body-file"]);
// gh pr edit flags that take a value; the first other word is the PR selector.
const EDIT_VALUE_FLAGS = new Set([
    ...TEXT_FLAGS,
    "-B",
    "--base",
    "-m",
    "--milestone",
    "--add-assignee",
    "--remove-assignee",
    "--add-label",
    "--remove-label",
    "--add-project",
    "--remove-project",
    "--add-reviewer",
    "--remove-reviewer",
]);
const REPO_FLAGS = new Set(["-R", "--repo"]);
// `> out`, `2>&1`, `<<EOF`: the redirection's target is in the same word or the next one.
const REDIRECT = /^\d*(?:<<?-?|>>?)&?(.*)$/;
const PR_URL = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;
const GITHUB_REMOTE = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?(?:\s|$)/gm;

/** Words and operators of a shell command, quotes resolved. */
function shellTokens(command) {
    const tokens = [];
    let word;
    const flush = () => {
        if (word !== undefined) tokens.push({ word });
        word = undefined;
    };
    for (let index = 0; index < command.length; index++) {
        const char = command[index];
        const operator = OPERATORS.find((candidate) => command.startsWith(candidate, index));
        if (operator !== undefined) {
            flush();
            tokens.push({ operator });
            index += operator.length - 1;
        } else if (char === " " || char === "\t") {
            flush();
        } else if (char === "'") {
            const end = command.indexOf("'", index + 1);
            word = (word ?? "") + command.slice(index + 1, end === -1 ? undefined : end);
            index = end === -1 ? command.length : end;
        } else if (char === '"') {
            let quoted = "";
            for (index++; index < command.length && command[index] !== '"'; index++) {
                if (command[index] === "\\" && index + 1 < command.length) index++;
                quoted += command[index];
            }
            word = (word ?? "") + quoted;
        } else if (char === "\\" && index + 1 < command.length) {
            word = (word ?? "") + command[++index];
        } else {
            word = (word ?? "") + char;
        }
    }
    flush();
    return tokens;
}

function simpleCommands(command) {
    const commands = [[]];
    for (const token of shellTokens(command)) {
        if (token.operator !== undefined) commands.push([]);
        else commands.at(-1).push(token.word);
    }
    return commands.filter((words) => words.length > 0);
}

function withoutPrefix(words) {
    let start = 0;
    while (/^[A-Za-z_]\w*=/.test(words[start] ?? "")) start++;
    if (["rtk", "command", "exec"].includes(words[start])) start++;
    return words.slice(start);
}

function prTarget(action, args) {
    const target = { action, setsText: false };
    for (let index = 0; index < args.length; index++) {
        const redirect = REDIRECT.exec(args[index]);
        if (redirect !== null) {
            if (redirect[1] === "") index++;
            continue;
        }
        const [flag, inlineValue] = args[index].split(/=(.*)/s);
        const takesValue =
            REPO_FLAGS.has(flag) || (action === "edit" && EDIT_VALUE_FLAGS.has(flag));
        const value = inlineValue ?? (takesValue ? args[++index] : undefined);
        if (REPO_FLAGS.has(flag)) target.repo = value;
        else if (action === "edit" && TEXT_FLAGS.has(flag)) target.setsText = true;
        else if (!flag.startsWith("-") && action === "edit" && target.selector === undefined) {
            target.selector = args[index];
        }
    }
    return target;
}

/** Each `gh pr create` and `gh pr edit` a Bash command runs, in order. */
export function pullRequestTargets(command) {
    return simpleCommands(command)
        .map(withoutPrefix)
        .filter(
            ([program, group, action]) =>
                program === "gh" && group === "pr" && (action === "create" || action === "edit"),
        )
        .map(([, , action, ...args]) => prTarget(action, args));
}

/** The last PR URL in a text, as gh pr create prints it. */
export function lastPullRequestUrl(text) {
    const match = [...(text ?? "").matchAll(PR_URL)].at(-1);
    return match === undefined
        ? undefined
        : { repo: match[1], number: Number(match[2]), url: match[0] };
}

/** The owner/name of every GitHub remote in `git remote -v` output. */
export function githubRepos(remoteOutput) {
    return [
        ...new Set([...remoteOutput.matchAll(GITHUB_REMOTE)].map(([, repo]) => repo.toLowerCase())),
    ];
}

function bulletList(items) {
    return items.map((item) => `- ${item}`).join("\n");
}

function wiringCheck(id, registry) {
    return `\`${id}\`: ${wiringQuestion(id, registry)}`;
}

function blockReason(pullRequest, registry, declaration, errors) {
    const reached = derivedLines(pullRequest.files, registry);
    const problem =
        declaration.sections > 1
            ? `PR #${pullRequest.number} has ${declaration.sections} "Ships in" sections, and the check reads only the first.`
            : `PR #${pullRequest.number} is a feat or fix whose files reach ${reached.map((id) => `\`${id}\``).join(", ")}, but it ticks nothing under "Ships in", so every one of those lines would list it.`;
    return [
        `${problem} Fix the body as the release-line check below says, write it to a file and run \`gh pr edit ${pullRequest.number} --body-file <file>\`.`,
        "",
        errors.join("\n\n"),
    ].join("\n");
}

function confirmContext(pullRequest, declaration, errors, registry) {
    const ticked = declaration.none ? [...declaration.lines, NO_LINE] : declaration.lines;
    return [
        `PR #${pullRequest.number} ticks ${ticked.map((id) => `\`${id}\``).join(", ")} under "Ships in". Confirm each ticked line by its wiring, and that no other line offers the change:`,
        bulletList(ticked.map((id) => wiringCheck(id, registry))),
        `If a box is wrong, write the corrected body to a file and run \`gh pr edit ${pullRequest.number} --body-file <file>\`. If every box is right, nothing to do.`,
        ...(errors.length > 0
            ? ["", "The release-line check also reports:", "", errors.join("\n\n")]
            : []),
    ].join("\n");
}

/** The hook's JSON answer for a PR, or undefined to stay silent. */
export function hookOutput(pullRequest, registry) {
    if (!isAttributedType(pullRequest.title)) return undefined;
    const declaration = parseShipsIn(pullRequest.body, registry);
    const errors = validate({ ...pullRequest, registry });
    if (isDeclared(declaration)) {
        return {
            hookSpecificOutput: {
                hookEventName: "PostToolUse",
                additionalContext: confirmContext(pullRequest, declaration, errors, registry),
            },
        };
    }
    if (!needsDeclaration(pullRequest, registry)) return undefined;
    return { decision: "block", reason: blockReason(pullRequest, registry, declaration, errors) };
}

function toolOutputText(toolResponse) {
    if (typeof toolResponse === "string") return toolResponse;
    return `${toolResponse?.stdout ?? ""}\n${toolResponse?.stderr ?? ""}`;
}

/** The `gh pr view` arguments for the PR a hook input created or retitled, or undefined. */
export function viewArguments(input) {
    if (input?.tool_name !== "Bash") return undefined;
    const target = pullRequestTargets(input.tool_input?.command ?? "")
        .filter(({ action, setsText }) => action === "create" || setsText)
        .at(-1);
    if (target === undefined) return undefined;
    const selector =
        target.action === "create"
            ? lastPullRequestUrl(toolOutputText(input.tool_response))?.url
            : target.selector;
    if (target.action === "create" && selector === undefined) return undefined;
    return [
        "pr",
        "view",
        ...(selector === undefined ? [] : [selector]),
        ...(target.repo === undefined ? [] : ["--repo", target.repo]),
        "--json",
        "number,url,state",
    ];
}

/** The repository and number of the viewed PR; undefined for a closed PR or another repository's. */
export function ownOpenPullRequest(view, ownRepos) {
    const location = lastPullRequestUrl(view.url);
    if (location === undefined || !ownRepos.includes(location.repo.toLowerCase())) return undefined;
    if (view.state !== "OPEN") return undefined;
    return { repo: location.repo, number: view.number ?? location.number };
}

function main() {
    const deadline = Date.now() + GH_BUDGET_MS;
    const run = (file, args, cwd) =>
        execFileSync(file, args, {
            cwd,
            encoding: "utf8",
            timeout: Math.max(1, deadline - Date.now()),
            stdio: ["ignore", "pipe", "ignore"],
        });
    const input = JSON.parse(readFileSync(stdin.fd, "utf8"));
    const args = viewArguments(input);
    if (args === undefined) return;
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const registry = JSON.parse(
        readFileSync(resolve(repoRoot, ".github/release-lines.json"), "utf8"),
    );
    const ownRepos = githubRepos(run("git", ["remote", "-v"], repoRoot));
    const location = ownOpenPullRequest(
        JSON.parse(run("gh", args, input.cwd ?? repoRoot)),
        ownRepos,
    );
    if (location === undefined) return;
    const pullRequest = fetchPullRequest(location.repo, location.number, (apiArgs) =>
        run("gh", ["api", ...apiArgs], repoRoot),
    );
    const output = hookOutput(pullRequest, registry);
    if (output !== undefined) stdout.write(`${JSON.stringify(output)}\n`);
}

if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
    try {
        main();
    } catch {
        // Fails open: the hook must never stand between Claude and the PR it is writing.
    }
}
