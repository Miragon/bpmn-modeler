import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    githubRepos,
    hookOutput,
    lastPullRequestUrl,
    pullRequestOf,
    pullRequestTargets,
    viewArguments,
    WIRING_CHECKS,
    type HookInput,
    type PullRequestView,
} from "../../../.claude/hooks/ships-in-check.mjs";
import releaseLines from "../../../.github/release-lines.json";
import type { ReleaseLineRegistry } from "../../../.github/scripts/release-routing.mjs";

const registry: ReleaseLineRegistry = releaseLines;
const HOOK_PATH = join(__dirname, "../../../.claude/hooks/ships-in-check.mjs");
const SETTINGS_PATH = join(__dirname, "../../../.claude/settings.json");
const FIXTURES = join(__dirname, "__fixtures__/shipsInHook");

function fixture<T>(name: string): T {
    return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
}

const createInput = fixture<HookInput>("postToolUseCreate.json");
const mergeFeatView = fixture<PullRequestView>("prViewMergeFeat.json");
const OWN_REPOS = ["miragon/bpmn-modeler"];

function bashInput(command: string, stdout = ""): HookInput {
    return {
        ...createInput,
        tool_input: { command },
        tool_response: { stdout, stderr: "", interrupted: false, isImage: false },
    };
}

function mergeFeat(body: string) {
    return pullRequestOf({ ...mergeFeatView, body }, OWN_REPOS)!;
}

describe("the PR commands the hook acts on", () => {
    it.each([
        { command: "gh pr create --fill", targets: [{ action: "create" }] },
        {
            command: "gh pr edit 12 --body-file body.md",
            targets: [{ action: "edit", selector: "12" }],
        },
        {
            command: "gh pr edit --title 'fix: a && b' https://github.com/o/r/pull/3",
            targets: [{ action: "edit", selector: "https://github.com/o/r/pull/3" }],
        },
        {
            command: "gh pr edit --add-label=x feat/branch",
            targets: [{ action: "edit", selector: "feat/branch" }],
        },
        {
            command: "gh pr edit -R o/r 4",
            targets: [{ action: "edit", repo: "o/r", selector: "4" }],
        },
        { command: "gh pr edit --body-file - <<'EOF'", targets: [{ action: "edit" }] },
        { command: "gh pr edit > out.txt", targets: [{ action: "edit" }] },
        { command: "gh pr edit 8 2>&1 | tail", targets: [{ action: "edit", selector: "8" }] },
        {
            command: "git push && GH_PROMPT_DISABLED=1 gh pr create --fill",
            targets: [{ action: "create" }],
        },
        { command: "(cd repo && gh pr edit 5 -b x)", targets: [{ action: "edit", selector: "5" }] },
        { command: "rtk gh pr edit 6; echo done", targets: [{ action: "edit", selector: "6" }] },
        {
            command: "gh pr create --fill && gh pr edit 7 --add-label x",
            targets: [{ action: "create" }, { action: "edit", selector: "7" }],
        },
    ])("finds $command", ({ command, targets }) => {
        expect(pullRequestTargets(command)).toEqual(targets);
    });

    it.each([
        "gh pr view 12",
        "gh pr list",
        "echo 'gh pr create'",
        'git commit -m "docs: say gh pr edit 3"',
        "gh issue edit 3",
    ])("ignores %s", (command) => {
        expect(pullRequestTargets(command)).toEqual([]);
    });
});

describe("the PR the hook reads", () => {
    it("views the PR whose URL gh pr create printed", () => {
        expect(viewArguments(createInput)).toEqual([
            "pr",
            "view",
            "https://github.com/Miragon/bpmn-modeler/pull/2600",
            "--json",
            "title,body,files,headRefName,url,number",
        ]);
    });

    it("views the PR gh pr edit names, in the repository it names", () => {
        expect(viewArguments(bashInput("gh pr edit -R o/r 4 --body x"))?.slice(2, 5)).toEqual([
            "4",
            "--repo",
            "o/r",
        ]);
    });

    it("views the current branch's PR when gh pr edit names none", () => {
        expect(viewArguments(bashInput("gh pr edit --body-file body.md"))?.slice(0, 3)).toEqual([
            "pr",
            "view",
            "--json",
        ]);
    });

    it.each([
        { case: "another tool", input: { ...createInput, tool_name: "Write" } },
        { case: "another command", input: bashInput("git status") },
        {
            case: "a create that printed no URL",
            input: bashInput("gh pr create --fill", "aborted"),
        },
        { case: "an input without a command", input: { tool_name: "Bash" } },
    ])("views nothing for $case", ({ input }) => {
        expect(viewArguments(input as HookInput)).toBeUndefined();
    });

    it("reads the last PR URL in a text", () => {
        expect(
            lastPullRequestUrl(
                "a https://github.com/o/r/pull/1 b https://github.com/o/r/pull/22\n",
            ),
        ).toEqual({
            repo: "o/r",
            number: 22,
            url: "https://github.com/o/r/pull/22",
        });
        expect(lastPullRequestUrl("no url")).toBeUndefined();
    });

    it("reads the GitHub repositories of the remotes, a fork and its upstream", () => {
        expect(
            githubRepos(
                [
                    "origin\tgit@github.com:someone/bpmn-modeler.git (fetch)",
                    "origin\tgit@github.com:someone/bpmn-modeler.git (push)",
                    "upstream\thttps://github.com/Miragon/bpmn-modeler (fetch)",
                    "other\thttps://gitlab.com/x/y.git (fetch)",
                ].join("\n"),
            ),
        ).toEqual(["someone/bpmn-modeler", "miragon/bpmn-modeler"]);
    });

    it("reads the PR's number, title, body, head branch and file paths", () => {
        expect(pullRequestOf(mergeFeatView, OWN_REPOS)).toMatchObject({
            number: 2600,
            title: "feat(bpmn-merge): offer the removed boundary events",
            headBranch: "feat/merge",
            files: [
                "libs/bpmn-merge/src/pickOutcome.ts",
                "libs/bpmn-merge/src/pickOutcome.spec.ts",
                "libs/shared/src/lib/mergePaneMessages.ts",
            ],
        });
    });

    it("leaves another repository's PR alone", () => {
        expect(
            pullRequestOf({ ...mergeFeatView, url: "https://github.com/o/r/pull/1" }, OWN_REPOS),
        ).toBeUndefined();
    });
});

describe("the hook's answer", () => {
    it("blocks a shared feat with nothing ticked and says what to tick and how to fix it", () => {
        const output = hookOutput(mergeFeat(mergeFeatView.body!), registry);

        expect(output).toMatchObject({ decision: "block" });
        expect(output?.reason).toContain("reach `vscode`, `intellij`, `orca`");
        expect(output?.reason).toContain("judged by wiring");
        expect(output?.reason).toContain(`\`intellij\`: ${WIRING_CHECKS.intellij}`);
        expect(output?.reason).toContain("gh pr edit 2600 --body-file <file>");
        expect(output?.reason).toContain("- [x] `orca`");
    });

    it("asks to confirm each ticked line by its wiring", () => {
        const output = hookOutput(
            mergeFeat(mergeFeatView.body!.replace("- [ ] `vscode`", "- [x] `vscode`")),
            registry,
        );

        expect(output).toEqual({
            hookSpecificOutput: {
                hookEventName: "PostToolUse",
                additionalContext: expect.stringContaining(`\`vscode\`: ${WIRING_CHECKS.vscode}`),
            },
        });
        expect(output?.hookSpecificOutput?.additionalContext).toContain("gh pr edit 2600");
        expect(output?.hookSpecificOutput?.additionalContext).not.toContain("also reports");
    });

    it("asks to confirm none, and passes on the check's errors", () => {
        const context = hookOutput(
            mergeFeat("## Ships in\n\n- [x] `none`\n- [x] `bpmn-modeler`\n"),
            registry,
        )?.hookSpecificOutput?.additionalContext;

        expect(context).toContain(`\`none\`: ${WIRING_CHECKS.none}`);
        expect(context).toContain("also reports");
        expect(context).toContain("`bpmn-modeler` is ticked under Ships in, but it ships none");
    });

    it.each([
        { case: "a chore", title: "chore(bpmn-merge): tidy", files: ["libs/bpmn-merge/src/a.ts"] },
        {
            case: "a feat that reaches one line",
            title: "feat: a",
            files: ["apps/vscode-plugin/src/a.ts"],
        },
        { case: "a docs change", title: "docs: a", files: ["docs/a.md"] },
    ])("stays silent for $case with nothing ticked", ({ title, files }) => {
        expect(
            hookOutput({ number: 1, title, body: "", files, headBranch: "x" }, registry),
        ).toBeUndefined();
    });

    it("has a wiring check for every release line and none", () => {
        expect(Object.keys(WIRING_CHECKS).sort()).toEqual(
            [...registry.lines.map(({ id }) => id), "none"].sort(),
        );
    });
});

describe("the hook process", () => {
    function runHook(stdin: string, env: NodeJS.ProcessEnv = { PATH: "" }) {
        return execFileSync(process.execPath, [HOOK_PATH], { input: stdin, env, encoding: "utf8" });
    }

    it.each([
        { case: "input that is no JSON", stdin: "not json" },
        { case: "a command that is no PR command", stdin: JSON.stringify(bashInput("git status")) },
        { case: "a PR command without gh or git on the PATH", stdin: JSON.stringify(createInput) },
    ])("exits 0 without output for $case", ({ stdin }) => {
        expect(runHook(stdin)).toBe("");
    });

    it("is registered after Bash for gh pr commands, also rewritten through rtk, with a timeout", () => {
        const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
        const handler = (filter: string) => ({
            type: "command",
            if: filter,
            command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/ships-in-check.mjs"',
            timeout: 20,
        });

        expect(settings.hooks.PostToolUse).toContainEqual({
            matcher: "Bash",
            hooks: [handler("Bash(gh pr *)"), handler("Bash(rtk gh pr *)")],
        });
    });
});
