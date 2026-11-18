#!/usr/bin/env node
// PostToolUse hook on Bash: after `gh pr create` or `gh pr edit`, reads the
// real PR and checks its "Ships in" boxes with release-routing.mjs. A feat or
// fix that reaches two or more lines with nothing ticked is blocked; ticked
// boxes get a request to confirm them by wiring. Fails open: any error, a
// missing gh, no network or another repository's PR exits silently.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { argv, stdin, stdout } from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
    derivedLines,
    isAttributedType,
    NO_LINE,
    parseShipsIn,
    validate,
} from "../../.github/scripts/release-routing.mjs";

const GH_TIMEOUT_MS = 8000;
const OPERATORS = ["&&", "||", ";;", "$(", "|", ";", "&", "(", ")", "\n", "`"];
// gh pr edit flags that take a value; the first other word is the PR selector.
const EDIT_VALUE_FLAGS = new Set([
    "-t",
    "--title",
    "-b",
    "--body",
    "-F",
    "--body-file",
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

/** Where a reader of each line's code decides whether that line offers a change. */
export const WIRING_CHECKS = Object.freeze({
    "bpmn-modeler":
        "the npm package's entry points (the `exports` of packages/bpmn-modeler/package.json and the files behind them): does a consumer of @miragon/bpmn-modeler reach the code?",
    "vscode":
        "the extension (apps/vscode-plugin/package.json contributions and apps/vscode-plugin/src): does VS Code open the editor or run the command that uses the code?",
    "intellij":
        "the bridge composition (apps/modeler-bridge/src/composition) and apps/intellij-plugin/src/main/resources/META-INF/plugin.xml: does IntelliJ register the editor or action, and does the bridge wire the service?",
    "orca": "the surfaces apps/orca-plugin/src creates (apps/orca-plugin/src/composition): does the Orca plugin create the surface that uses the code?",
    "dmn-modeler":
        "whether @miragon/dmn-modeler uses the code at all (packages/dmn-modeler/src and its exports)",
    [NO_LINE]: "a fix to a feature no release shipped yet: is that true for every line?",
});

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
    const target = { action };
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

function wiringCheck(id) {
    return `\`${id}\`: ${WIRING_CHECKS[id] ?? "the code that wires this line's users to the change"}`;
}

function blockReason(pullRequest, registry, errors) {
    const reached = derivedLines(pullRequest.files, registry);
    return [
        `PR #${pullRequest.number} is a feat or fix whose files reach ${reached.map((id) => `\`${id}\``).join(", ")}, but it ticks nothing under "Ships in", so every one of those lines would list it.`,
        "Tick only the lines whose users get the change, judged by wiring, not by the files a line bundles. Check for each line:",
        bulletList([...reached, NO_LINE].map(wiringCheck)),
        `Then write the corrected body to a file and run \`gh pr edit ${pullRequest.number} --body-file <file>\`. The release-line check says:`,
        "",
        errors.join("\n\n"),
    ].join("\n");
}

function confirmContext(pullRequest, declaration, errors) {
    const ticked = declaration.none ? [...declaration.lines, NO_LINE] : declaration.lines;
    return [
        `PR #${pullRequest.number} ticks ${ticked.map((id) => `\`${id}\``).join(", ")} under "Ships in". Confirm each ticked line by its wiring, and that no other line offers the change:`,
        bulletList(ticked.map(wiringCheck)),
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
    if (declaration.lines.length > 0 || declaration.none) {
        return {
            hookSpecificOutput: {
                hookEventName: "PostToolUse",
                additionalContext: confirmContext(pullRequest, declaration, errors),
            },
        };
    }
    if (derivedLines(pullRequest.files, registry).length < 2) return undefined;
    return { decision: "block", reason: blockReason(pullRequest, registry, errors) };
}

function toolOutputText(toolResponse) {
    if (typeof toolResponse === "string") return toolResponse;
    return `${toolResponse?.stdout ?? ""}\n${toolResponse?.stderr ?? ""}`;
}

/** The `gh pr view` arguments for the PR a hook input acted on, or undefined. */
export function viewArguments(input) {
    if (input?.tool_name !== "Bash") return undefined;
    const target = pullRequestTargets(input.tool_input?.command ?? "").at(-1);
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
        "title,body,files,headRefName,url,number",
    ];
}

/** The PR as the check reads it, from `gh pr view --json` output; undefined for another repository's PR. */
export function pullRequestOf(view, ownRepos) {
    const location = lastPullRequestUrl(view.url);
    if (location === undefined || !ownRepos.includes(location.repo.toLowerCase())) return undefined;
    return {
        number: view.number ?? location.number,
        title: view.title ?? "",
        body: view.body ?? "",
        headBranch: view.headRefName,
        files: (view.files ?? []).map(({ path }) => path),
    };
}

function run(file, args, cwd) {
    return execFileSync(file, args, {
        cwd,
        encoding: "utf8",
        timeout: GH_TIMEOUT_MS,
        stdio: ["ignore", "pipe", "ignore"],
    });
}

function main() {
    const input = JSON.parse(readFileSync(stdin.fd, "utf8"));
    const args = viewArguments(input);
    if (args === undefined) return;
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const registry = JSON.parse(
        readFileSync(resolve(repoRoot, ".github/release-lines.json"), "utf8"),
    );
    const ownRepos = githubRepos(run("git", ["remote", "-v"], repoRoot));
    const pullRequest = pullRequestOf(JSON.parse(run("gh", args, input.cwd ?? repoRoot)), ownRepos);
    if (pullRequest === undefined) return;
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
