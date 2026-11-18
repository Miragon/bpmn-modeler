import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    githubRepos,
    hookOutput,
    lastPullRequestUrl,
    NONE_WIRING,
    ownOpenPullRequest,
    pullRequestTargets,
    viewArguments,
    type HookInput,
    type HookPullRequest,
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
const mergeFeatView = fixture<
    PullRequestView & {
        title: string;
        body: string;
        headRefName: string;
        files: { path: string }[];
    }
>("prViewMergeFeat.json");
const OWN_REPOS = ["miragon/bpmn-modeler"];

function bashInput(command: string, stdout = ""): HookInput {
    return {
        ...createInput,
        tool_input: { command },
        tool_response: { stdout, stderr: "", interrupted: false, isImage: false },
    };
}

function mergeFeat(body: string): HookPullRequest {
    return {
        number: mergeFeatView.number!,
        title: mergeFeatView.title,
        body,
        headBranch: mergeFeatView.headRefName,
        fromFork: false,
        files: mergeFeatView.files.map(({ path }) => path),
    };
}

function wiringOf(id: string): string {
    return registry.lines.find((line) => line.id === id)!.wiring!;
}

describe("the PR commands the hook acts on", () => {
    it.each([
        { command: "gh pr create --fill", targets: [{ action: "create", setsText: false }] },
        {
            command: "gh pr edit 12 --body-file body.md",
            targets: [{ action: "edit", selector: "12", setsText: true }],
        },
        {
            command: "gh pr edit --title 'fix: a && b' https://github.com/o/r/pull/3",
            targets: [
                { action: "edit", selector: "https://github.com/o/r/pull/3", setsText: true },
            ],
        },
        {
            command: "gh pr edit --add-label=x feat/branch",
            targets: [{ action: "edit", selector: "feat/branch", setsText: false }],
        },
        {
            command: "gh pr edit -R o/r 4",
            targets: [{ action: "edit", repo: "o/r", selector: "4", setsText: false }],
        },
        {
            command: "gh pr edit --body-file - <<'EOF'",
            targets: [{ action: "edit", setsText: true }],
        },
        { command: "gh pr edit > out.txt", targets: [{ action: "edit", setsText: false }] },
        {
            command: "gh pr edit 8 -t x 2>&1 | tail",
            targets: [{ action: "edit", selector: "8", setsText: true }],
        },
        {
            command: "git push && GH_PROMPT_DISABLED=1 gh pr create --fill",
            targets: [{ action: "create", setsText: false }],
        },
        {
            command: "(cd repo && gh pr edit 5 -b x)",
            targets: [{ action: "edit", selector: "5", setsText: true }],
        },
        {
            command: "rtk gh pr edit 6 --body=x; echo done",
            targets: [{ action: "edit", selector: "6", setsText: true }],
        },
        {
            command: "gh pr create --fill && gh pr edit 7 --add-label x",
            targets: [
                { action: "create", setsText: false },
                { action: "edit", selector: "7", setsText: false },
            ],
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
            "number,url,state",
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
        { case: "another command", input: bashInput("gh pr view 12") },
        {
            case: "a create that printed no URL",
            input: bashInput("gh pr create --fill", "aborted"),
        },
        { case: "an input without a command", input: { tool_name: "Bash" } },
        {
            case: "an edit of neither title nor body",
            input: bashInput("gh pr edit 7 --add-label x"),
        },
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

    it("reads an open PR of this repository by its repository and number", () => {
        expect(ownOpenPullRequest(mergeFeatView, OWN_REPOS)).toEqual({
            repo: "Miragon/bpmn-modeler",
            number: 2600,
        });
    });

    it.each([
        { case: "another repository's PR", view: { url: "https://github.com/o/r/pull/1" } },
        { case: "a merged PR", view: { state: "MERGED" } },
        { case: "a closed PR", view: { state: "CLOSED" } },
    ])("leaves $case alone", ({ view }) => {
        expect(ownOpenPullRequest({ ...mergeFeatView, ...view }, OWN_REPOS)).toBeUndefined();
    });
});

describe("the hook's answer", () => {
    it("blocks a shared feat with nothing ticked and says what to tick and how to fix it", () => {
        const output = hookOutput(mergeFeat(mergeFeatView.body), registry);

        expect(output).toMatchObject({ decision: "block" });
        expect(output?.reason).toContain("reach `vscode`, `intellij`, `orca`");
        expect(output?.reason).toContain("judged by wiring");
        expect(output?.reason).toContain(`\`intellij\`: ${wiringOf("intellij")}`);
        expect(output?.reason).toContain("gh pr edit 2600 --body-file <file>");
        expect(output?.reason).toContain("- [x] `orca`");
    });

    it("asks to confirm each ticked line by its wiring", () => {
        const output = hookOutput(
            mergeFeat(mergeFeatView.body.replace("- [ ] `vscode`", "- [x] `vscode`")),
            registry,
        );

        expect(output).toEqual({
            hookSpecificOutput: {
                hookEventName: "PostToolUse",
                additionalContext: expect.stringContaining(`\`vscode\`: ${wiringOf("vscode")}`),
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

        expect(context).toContain(`\`none\`: ${NONE_WIRING}`);
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
            hookOutput(
                { number: 1, title, body: "", files, headBranch: "x", fromFork: false },
                registry,
            ),
        ).toBeUndefined();
    });

    it("has the wiring of every release line in the registry", () => {
        for (const line of registry.lines) expect(line.wiring, line.id).toMatch(/\S/);
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

    it("is registered once after every Bash call, spawned without a shell", () => {
        const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));

        // An `if` filter runs the hook anyway on `$()`, so two filters ran it twice.
        expect(settings.hooks.PostToolUse).toContainEqual({
            matcher: "Bash",
            hooks: [
                {
                    type: "command",
                    command: "node",
                    args: ["${CLAUDE_PROJECT_DIR}/.claude/hooks/ships-in-check.mjs"],
                    timeout: 20,
                },
            ],
        });
    });
});
