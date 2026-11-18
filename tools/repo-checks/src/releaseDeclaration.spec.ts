import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import releaseLines from "../../../.github/release-lines.json";
import { needsDeclaration, validate } from "../../../.github/scripts/release-check.mjs";
import { NONE_WIRING, parseShipsIn } from "../../../.github/scripts/release-declaration.mjs";
import {
    planAttributions,
    pullRequestNumber,
    resolveAttribution,
    routingSummary,
    suggest,
    type ReleaseLineRegistry,
} from "../../../.github/scripts/release-routing.mjs";

const registry: ReleaseLineRegistry = releaseLines;
const template = readFileSync(join(__dirname, "../../../.github/pull_request_template.md"), "utf8");

/** A package and a host that bundles it, so a case states its own rules. */
const sample: ReleaseLineRegistry = {
    ignore: ["**/*.spec.ts"],
    unreleased: [],
    lines: [
        {
            id: "package",
            componentPath: "release/package",
            ships: ["packages/lib/**", "libs/types/**"],
            breaking: ["**"],
            wiring: "does a consumer of the package reach the code?",
        },
        {
            id: "host",
            componentPath: "release/host",
            ships: ["apps/host/**", "packages/lib/**", "libs/types/**", "libs/merge/**"],
            breaking: ["apps/host/**"],
            wiring: "does the host open the editor that uses the code?",
        },
    ],
};

function shipsIn(...boxes: string[]): string {
    return [
        "## Description",
        "",
        "Text.",
        "",
        "## Ships in",
        "",
        ...boxes,
        "",
        "## Author checklist",
    ].join("\n");
}

describe("the Ships in declaration of a PR body", () => {
    it("reads the ticked lines and leaves the unticked ones out", () => {
        expect(
            parseShipsIn(
                shipsIn("- [x] `host`: the host", "- [ ] `package`: the npm package"),
                sample,
            ),
        ).toEqual({ found: true, lines: ["host"], none: false, wording: {}, errors: [] });
    });

    it.each([
        { form: "an upper-case X", box: "- [X] `host`" },
        { form: "extra spaces", box: "  *   [x]    `host`   : the host" },
        { form: "an id without backticks", box: "- [x] host" },
    ])("tolerates $form", ({ box }) => {
        expect(parseShipsIn(shipsIn(box), sample).lines).toEqual(["host"]);
    });

    it("reads a body with CRLF line ends", () => {
        expect(
            parseShipsIn(shipsIn("- [x] `host`").replaceAll("\n", "\r\n"), sample).lines,
        ).toEqual(["host"]);
    });

    it("lists the lines in the registry's order", () => {
        expect(parseShipsIn(shipsIn("- [x] `host`", "- [x] `package`"), sample).lines).toEqual([
            "package",
            "host",
        ]);
    });

    it("reads none", () => {
        expect(
            parseShipsIn(shipsIn("- [x] `none`: no released user gets it"), sample),
        ).toMatchObject({
            lines: [],
            none: true,
        });
    });

    it("finds nothing in a body without the section", () => {
        expect(parseShipsIn("## Description\n\n- [x] `host`\n", sample)).toEqual({
            found: false,
            lines: [],
            none: false,
            wording: {},
            errors: [],
        });
        expect(parseShipsIn("", sample).found).toBe(false);
        expect(parseShipsIn(undefined, sample).found).toBe(false);
    });

    it("ignores a ticked example inside an HTML comment, also one across lines", () => {
        expect(
            parseShipsIn(
                shipsIn("<!--", "- [x] `host` as `fix(host): example`", "-->", "- [ ] `package`"),
                sample,
            ),
        ).toMatchObject({ lines: [], wording: {} });
        expect(
            parseShipsIn(shipsIn("<!-- - [x] `host` --> - [ ] `package`"), sample).lines,
        ).toEqual([]);
    });

    it("ignores a ticked box in fenced code", () => {
        expect(
            parseShipsIn(
                shipsIn("```md", "- [x] `host`", "```", "~~~", "- [x] `package`", "~~~"),
                sample,
            ).lines,
        ).toEqual([]);
    });

    it("ignores a box below the next heading", () => {
        expect(
            parseShipsIn(shipsIn("- [ ] `host`") + "\n\n- [x] `package`\n", sample).lines,
        ).toEqual([]);
    });

    it("reads a line's own wording", () => {
        expect(
            parseShipsIn(
                shipsIn("- [x] `package` as `fix(viewer): keep the zoom`: the npm package"),
                sample,
            ),
        ).toMatchObject({ lines: ["package"], wording: { package: "fix(viewer): keep the zoom" } });
    });

    it("keeps no wording for an unticked line", () => {
        expect(parseShipsIn(shipsIn("- [ ] `package` as `fix: a`"), sample).wording).toEqual({});
    });

    it("reports a ticked id that is no release line", () => {
        const { lines, errors } = parseShipsIn(shipsIn("- [x] `hots`", "- [ ] `other`"), sample);

        expect(lines).toEqual([]);
        expect(errors).toEqual([
            "`hots` under Ships in is no release line; tick one of `package`, `host` or `none`.",
        ]);
    });

    it("reads a box in an ordered list", () => {
        expect(parseShipsIn(shipsIn("1. [x] `host`"), sample).lines).toEqual(["host"]);
    });

    it("keeps reading after a code span or a fenced block that holds <!--", () => {
        expect(
            parseShipsIn(
                ["Use `<!--` to hide text.", "", "## Ships in", "", "- [x] `host`"].join("\n"),
                sample,
            ).lines,
        ).toEqual(["host"]);
        expect(
            parseShipsIn(
                ["```html", "<!-- a", "```", "", "## Ships in", "", "- [x] `none`"].join("\n"),
                sample,
            ).none,
        ).toBe(true);
    });

    it("keeps reading after an unclosed <!-- inside a line, which GitHub shows as text", () => {
        expect(
            parseShipsIn(
                ["Text <!-- not closed", "", "## Ships in", "", "- [x] `host`"].join("\n"),
                sample,
            ).lines,
        ).toEqual(["host"]);
    });

    it("hides the rest after an unclosed <!-- at a line start, as GitHub does", () => {
        expect(
            parseShipsIn(["<!-- note", "", "## Ships in", "", "- [x] `host`"].join("\n"), sample)
                .found,
        ).toBe(false);
    });

    it("ignores a ticked box in an indented code block", () => {
        expect(parseShipsIn(shipsIn("    - [x] `host`"), sample).lines).toEqual([]);
        expect(parseShipsIn(shipsIn("Text:", "", "\t- [x] `host`"), sample).lines).toEqual([]);
    });

    it("reads an indented box that continues a list, also after a blank line", () => {
        expect(parseShipsIn(shipsIn("- [ ] `package`", "    - [x] `host`"), sample).lines).toEqual([
            "host",
        ]);
        expect(
            parseShipsIn(shipsIn("- [ ] `package`", "", "    - [x] `host`"), sample).lines,
        ).toEqual(["host"]);
    });

    it.each(["**host**", "[host](https://example.com)", ""])(
        "reports the ticked box %j, whose line it cannot read",
        (text) => {
            expect(parseShipsIn(shipsIn(`- [x] ${text}`), sample)).toMatchObject({
                lines: [],
                errors: [
                    `The ticked box \`${`- [x] ${text}`.trim()}\` under Ships in names no line; write it as - [x] \`<line id>\`.`,
                ],
            });
        },
    );

    it("reports a wording without backticks", () => {
        expect(parseShipsIn(shipsIn("- [x] `host` as fix: a"), sample).errors).toEqual([
            "The wording of `host` under Ships in needs backticks: - [x] `host` as `fix(<scope>): <subject>`.",
        ]);
    });

    it("reports a line ticked twice", () => {
        expect(
            parseShipsIn(shipsIn("- [x] `host` as `fix: a`", "- [x] `host` as `fix: b`"), sample)
                .errors,
        ).toEqual(["`host` is ticked twice under Ships in; keep one box."]);
    });

    it("reports a second Ships in section and reads the first", () => {
        const declaration = parseShipsIn(
            `${shipsIn("- [x] `host`")}\n\n## Ships in\n\n- [x] \`package\`\n`,
            sample,
        );

        expect(declaration.lines).toEqual(["host"]);
        expect(declaration.errors).toEqual([
            "The body has 2 Ships in sections, and the check reads only the first; keep one.",
        ]);
    });

    it("lists every release line and none in the PR template, all unticked", () => {
        const declaration = parseShipsIn(template, registry);
        const ticked = parseShipsIn(template.replaceAll("- [ ] `", "- [x] `"), registry);

        expect(declaration).toMatchObject({ found: true, lines: [], none: false, errors: [] });
        expect(ticked.lines).toEqual(registry.lines.map(({ id }) => id));
        expect(ticked.none).toBe(true);
        expect(ticked.wording).toEqual({});
    });
});

describe("the attribution of a declared change", () => {
    const files = ["libs/types/src/a.ts"];

    it("gives a feat only the lines its PR ticks", () => {
        expect(
            resolveAttribution(
                { title: "feat: a (#1)", files, body: shipsIn("- [x] `host`") },
                sample,
            ),
        ).toEqual({ source: "declared", groups: [{ subject: "feat: a (#1)", lines: ["host"] }] });
    });

    it("falls back to the derived lines when nothing is ticked", () => {
        expect(
            resolveAttribution(
                { title: "feat: a (#1)", files, body: shipsIn("- [ ] `host`") },
                sample,
            ),
        ).toEqual({
            source: "derived",
            groups: [{ subject: "feat: a (#1)", lines: ["package", "host"] }],
        });
    });

    it("attributes a change its PR ships to none to no line", () => {
        expect(
            resolveAttribution(
                { title: "fix: a (#1)", files, body: shipsIn("- [x] `none`") },
                sample,
            ),
        ).toEqual({ source: "none", groups: [] });
    });

    it("leaves out a ticked line that ships none of the files", () => {
        expect(
            resolveAttribution(
                {
                    title: "feat: m (#2)",
                    files: ["libs/merge/src/m.ts"],
                    body: shipsIn("- [x] `host`", "- [x] `package`"),
                },
                sample,
            ).groups,
        ).toEqual([{ subject: "feat: m (#2)", lines: ["host"] }]);
    });

    it("lists a line under its own wording, with the PR number of the title, grouped by wording", () => {
        expect(
            resolveAttribution(
                {
                    title: "feat(types): add a (#3)",
                    files,
                    body: shipsIn("- [x] `package` as `fix(viewer): keep a`", "- [x] `host`"),
                },
                sample,
            ).groups,
        ).toEqual([
            { subject: "fix(viewer): keep a (#3)", lines: ["package"] },
            { subject: "feat(types): add a (#3)", lines: ["host"] },
        ]);
    });

    it("keeps a breaking mark only on the ticked lines whose breaking globs match", () => {
        expect(
            resolveAttribution(
                {
                    title: "feat(types)!: rename a (#4)",
                    files,
                    body: shipsIn("- [x] `package`", "- [x] `host`"),
                },
                sample,
            ).groups,
        ).toEqual([
            { subject: "feat(types)!: rename a (#4)", lines: ["package"] },
            { subject: "feat(types): rename a (#4)", lines: ["host"] },
        ]);
    });

    it.each(["chore: x", ""])(
        "ignores the wording %j, which is no feat or fix subject, and lists the title",
        (wording) => {
            expect(
                resolveAttribution(
                    {
                        title: "feat(types): add a (#5)",
                        files,
                        body: shipsIn(`- [x] \`host\` as \`${wording}\``),
                    },
                    sample,
                ).groups,
            ).toEqual([{ subject: "feat(types): add a (#5)", lines: ["host"] }]);
        },
    );

    it("gives a wording the breaking mark the title gives its line", () => {
        expect(
            resolveAttribution(
                {
                    title: "feat(types)!: rename a (#6)",
                    files,
                    body: shipsIn(
                        "- [x] `package` as `feat(npm): rename a`",
                        "- [x] `host` as `feat(host)!: rename a`",
                    ),
                },
                sample,
            ).groups,
        ).toEqual([
            { subject: "feat(npm)!: rename a (#6)", lines: ["package"] },
            { subject: "feat(host): rename a (#6)", lines: ["host"] },
        ]);
    });

    it("drops a breaking mark a wording adds to a change that is not breaking", () => {
        expect(
            resolveAttribution(
                {
                    title: "feat(types): add a (#7)",
                    files,
                    body: shipsIn("- [x] `host` as `feat(host)!: add a`"),
                },
                sample,
            ).groups,
        ).toEqual([{ subject: "feat(host): add a (#7)", lines: ["host"] }]);
    });

    it("attributes a chore to no line, whatever it ticks", () => {
        expect(
            resolveAttribution({ title: "chore: a", files, body: shipsIn("- [x] `host`") }, sample)
                .groups,
        ).toEqual([]);
    });
});

describe("the routing of merged commits with their PR's declaration", () => {
    const files = ["libs/types/src/a.ts"];

    it("asks only for the lines the merged PR ticks, so the audit demands no other", () => {
        const { writes, decisions } = planAttributions(
            [
                {
                    sha: "a1aaaaaaaa",
                    title: "feat: a (#1)",
                    files,
                    pullRequest: { head: "feat/a", body: shipsIn("- [x] `host`") },
                },
            ],
            [],
            sample,
        );

        expect(writes.map(({ lines }) => lines)).toEqual([["host"]]);
        expect(routingSummary("Audit", decisions)).toContain(
            "| a1aaaaa | feat: a (#1) | adds host (declared) |",
        );
    });

    it("says when a commit's lines follow its files because no PR was found", () => {
        const { decisions } = planAttributions(
            [{ sha: "b2bbbbbbbb", title: "fix: b", files, pullRequest: null }],
            [],
            sample,
        );

        expect(routingSummary("Sync", decisions)).toContain(
            "| b2bbbbb | fix: b | adds package, host (derived: no PR found) |",
        );
    });

    it("says when the merged PR ships the change to none", () => {
        const { writes, decisions } = planAttributions(
            [
                {
                    sha: "c3cccccccc",
                    title: "fix: c (#3)",
                    files,
                    pullRequest: { head: "fix/c", body: shipsIn("- [x] `none`") },
                },
            ],
            [],
            sample,
        );

        expect(writes).toEqual([]);
        expect(routingSummary("Sync", decisions)).toContain(
            "| c3ccccc | fix: c (#3) | none: the PR ships it to none |",
        );
    });
});

describe("the validation of a PR", () => {
    const shared = ["libs/types/src/a.ts"];
    const pr = (overrides: Partial<Parameters<typeof validate>[0]>) =>
        validate({
            title: "feat(types): add a",
            body: shipsIn("- [ ] `package`", "- [ ] `host`"),
            files: shared,
            registry: sample,
            headBranch: "feat/a",
            ...overrides,
        });

    it("asks a feat that reaches two lines to declare them, with the boxes to put under Ships in", () => {
        const [error, ...rest] = pr({});

        expect(rest).toEqual([]);
        expect(error).toContain("reaches `package`, `host` by its files");
        expect(error).toContain('in place of the boxes under the body\'s "## Ships in" heading');
        expect(error).toContain(
            suggest({ title: "feat(types): add a", files: shared, registry: sample }),
        );
        expect(error).not.toContain("- [x]");
    });

    it("says once what to tick and once what `none` means", () => {
        const [error] = pr({});

        expect(error.split(/\btick\b/i)).toHaveLength(2);
        expect(error.split("no release shipped")).toHaveLength(2);
    });

    it("reports only the second section when a block is pasted below the template's", () => {
        const pastedBelow = `${shipsIn("- [ ] `package`", "- [ ] `host`")}\n\n## Ships in\n\n- [x] \`host\`\n`;

        expect(pr({ body: pastedBelow })).toEqual([
            "The body has 2 Ships in sections, and the check reads only the first; keep one.",
        ]);
    });

    it.each([
        { case: "a feat that reaches one line", files: ["apps/host/a.ts"], title: "feat: a" },
        { case: "a chore that reaches two lines", files: shared, title: "chore: a" },
        { case: "a docs change", files: ["docs/a.md"], title: "docs: a" },
    ])("passes $case with nothing ticked", ({ files, title }) => {
        expect(pr({ files, title })).toEqual([]);
    });

    it("passes a feat that ticks its lines", () => {
        expect(pr({ body: shipsIn("- [x] `host`") })).toEqual([]);
        expect(pr({ body: shipsIn("- [x] `none`") })).toEqual([]);
    });

    it("rejects a ticked line that ships none of the changed files", () => {
        expect(
            pr({ files: ["libs/merge/m.ts"], body: shipsIn("- [x] `package`", "- [x] `host`") }),
        ).toEqual([
            "`package` is ticked under Ships in, but it ships none of the changed files; untick it.",
        ]);
    });

    it("rejects none ticked together with a line", () => {
        expect(pr({ body: shipsIn("- [x] `none`", "- [x] `host`") })).toEqual([
            "`none` is ticked together with `host` under Ships in; tick either `none` or the lines.",
        ]);
    });

    it("rejects a breaking change that hits a line's breaking globs without ticking that line", () => {
        expect(pr({ title: "feat(types)!: rename a", body: shipsIn("- [x] `host`") })).toEqual([
            "The breaking change touches what `package` guarantees (its breaking globs); tick `package` under Ships in.",
        ]);
        expect(pr({ title: "feat(types)!: rename a", body: shipsIn("- [x] `package`") })).toEqual(
            [],
        );
    });

    it.each([
        "keep the zoom",
        "chore(viewer): keep the zoom",
        "fix(viewer) keep the zoom",
        "fix: ",
    ])("rejects the wording %s, which is no feat or fix subject", (wording) => {
        expect(pr({ body: shipsIn(`- [x] \`host\` as \`${wording}\``) })).toEqual([
            `The wording of \`host\` under Ships in, \`${wording}\`, is no feat or fix subject; write it as \`fix(<scope>): <subject>\` or \`feat(<scope>): <subject>\`.`,
        ]);
    });

    it("passes a wording that is a feat or fix subject", () => {
        expect(pr({ body: shipsIn("- [x] `host` as `fix(viewer): keep the zoom`") })).toEqual([]);
    });

    it("rejects a wording that adds a breaking mark the title does not give its line", () => {
        const added =
            "The wording of `host` under Ships in has a breaking `!`, but a line takes `!` only from a breaking title whose files hit its breaking globs; drop the `!`.";

        expect(pr({ body: shipsIn("- [x] `host` as `fix(viewer)!: keep the zoom`") })).toEqual([
            added,
        ]);
        expect(
            pr({
                title: "feat(types)!: rename a",
                body: shipsIn("- [x] `package`", "- [x] `host` as `feat(host)!: rename a`"),
            }),
        ).toEqual([added]);
    });

    it("rejects a wording that drops the breaking mark the title gives its line", () => {
        expect(
            pr({
                title: "feat(types)!: rename a",
                body: shipsIn("- [x] `package` as `feat(npm): rename a`"),
            }),
        ).toEqual([
            "The wording of `package` under Ships in has no `!`, but the breaking title applies to that line (its breaking globs); mark the wording breaking too.",
        ]);
    });

    it("reports a ticked id that is no release line", () => {
        expect(pr({ body: shipsIn("- [x] `hots`", "- [x] `host`") })).toEqual([
            "`hots` under Ships in is no release line; tick one of `package`, `host` or `none`.",
        ]);
    });

    it("rejects a PR that edits release/**", () => {
        expect(pr({ title: "chore: a", files: ["release/host/version.txt"] })).toEqual([
            "This PR changes release/host/version.txt; only the sync workflow and the release PR write release/**. Revert the change.",
        ]);
    });

    it("lets a PR add the folder of a line the registry does not have yet", () => {
        expect(
            pr({
                title: "chore(release): add a line",
                files: [".github/release-lines.json", "release/new-line/version.txt"],
            }),
        ).toEqual([]);
    });

    it.each([
        { case: "another release-please branch", headBranch: "release-please--branches--x" },
        {
            case: "the release branch of a fork",
            headBranch: "release-please--branches--main",
            fromFork: true,
        },
    ])("rejects release/** changes from $case", ({ headBranch, fromFork }) => {
        expect(
            pr({
                title: "chore: release main",
                files: ["release/host/version.txt"],
                headBranch,
                fromFork,
            }),
        ).toHaveLength(1);
    });

    it("lets the release PR change release/**", () => {
        expect(
            pr({
                title: "chore: release main",
                files: ["release/host/version.txt", "apps/host/CHANGELOG.md"],
                body: "release notes",
                headBranch: "release-please--branches--main",
            }),
        ).toEqual([]);
    });
});

describe("whether a PR must declare its lines", () => {
    const shared = ["libs/types/src/a.ts"];

    it.each([
        { case: "a feat reaching two lines, nothing ticked", files: shared, body: "", needs: true },
        {
            case: "a feat that ticks a line",
            files: shared,
            body: shipsIn("- [x] `host`"),
            needs: false,
        },
        {
            case: "a feat that ticks none",
            files: shared,
            body: shipsIn("- [x] `none`"),
            needs: false,
        },
        { case: "a feat that reaches one line", files: ["apps/host/a.ts"], body: "", needs: false },
    ])("says $needs for $case", ({ files, body, needs }) => {
        expect(needsDeclaration({ title: "feat: a", files, body }, sample)).toBe(needs);
    });

    it("says false for a chore that reaches two lines", () => {
        expect(needsDeclaration({ title: "chore: a", files: shared, body: "" }, sample)).toBe(
            false,
        );
    });
});

describe("the PR number of a squash commit", () => {
    it.each([
        { title: "feat: a (#12)", number: 12 },
        { title: 'Revert "feat: a (#3)" (#9)', number: 9 },
        { title: "feat: a", number: undefined },
        { title: "feat: a (#12) more", number: undefined },
    ])("reads $number from $title", ({ title, number }) => {
        expect(pullRequestNumber(title)).toBe(number);
    });
});

describe("the suggested Ships in block", () => {
    const shared = ["libs/types/a.ts"];
    const pasted = (block: string) =>
        validate({
            title: "feat(types): add a",
            body: shipsIn(block),
            files: shared,
            registry: sample,
            headBranch: "feat/a",
        });

    it("lists each line the files reach unticked with its wiring question, then none with its own", () => {
        expect(suggest({ title: "feat: a", files: shared, registry: sample })).toBe(
            [
                "- [ ] `package`: does a consumer of the package reach the code?",
                "- [ ] `host`: does the host open the editor that uses the code?",
                `- [ ] \`none\`: ${NONE_WIRING}`,
                "",
            ].join("\n"),
        );
    });

    it("leaves out the lines the files do not reach", () => {
        const block = suggest({ title: "feat: a", files: ["libs/merge/m.ts"], registry: sample });

        expect(block).toContain("- [ ] `host`");
        expect(block).not.toContain("`package`");
    });

    it("asks a line without wiring whether it offers the change", () => {
        const unwired: ReleaseLineRegistry = {
            ...sample,
            lines: sample.lines.map(({ wiring: _wiring, ...line }) => line),
        };

        expect(suggest({ files: ["libs/merge/m.ts"], registry: unwired })).toContain(
            "- [ ] `host`: does this line offer the change?\n",
        );
    });

    it("ticks nothing, so pasted unchanged it still fails the check", () => {
        const block = suggest({ title: "feat: a", files: shared, registry: sample });

        expect(parseShipsIn(block, sample)).toMatchObject({ lines: [], none: false, errors: [] });
        expect(pasted(block)).toEqual([expect.stringContaining("must say which of them ships it")]);
    });

    it.each([
        { box: "`host`", lines: ["host"], none: false },
        { box: "`none`", lines: [], none: true },
    ])("passes the check once $box is ticked in the pasted block", ({ box, lines, none }) => {
        const block = suggest({ title: "feat: a", files: shared, registry: sample }).replace(
            `- [ ] ${box}`,
            `- [x] ${box}`,
        );

        expect(parseShipsIn(block, sample)).toMatchObject({ lines, none });
        expect(pasted(block)).toEqual([]);
    });
});

describe("real merged PRs", () => {
    const mergeFiles = [
        "apps/bpmn-webview/src/domain/mergeTexts.ts",
        "libs/bpmn-i18n-extras/src/languages/de.ts",
        "libs/bpmn-merge/src/buildMerged.ts",
        "libs/shared/src/lib/mergePaneMessages.ts",
    ];

    it("asks a bpmn-merge feat without a declaration to declare its lines (a PR 2542-like change)", () => {
        expect(
            validate({
                title: "feat(bpmn-merge): restore the source's default with a restored flow",
                body: "## Description\n\nText.\n",
                files: mergeFiles,
                registry,
                headBranch: "peterhnm/feat-2486-restore-source-default",
            }),
        ).toHaveLength(1);
    });

    it("suggests every line a translation reaches unticked, so the merge view must pick vscode", () => {
        const merge = {
            title: "feat(bpmn-merge): restore the source's default with a restored flow",
            files: mergeFiles,
            registry,
            headBranch: "peterhnm/feat-2486-restore-source-default",
        };
        const block = suggest(merge);
        const templateBoxes = /(?:^- \[ \] `[^\n]*\n)+/m;
        const body = template.replace(templateBoxes, block);
        const withBody = (text: string) => validate({ ...merge, body: text });

        for (const line of registry.lines) {
            expect(block).toContain(`- [ ] \`${line.id}\`: ${line.wiring}`);
        }
        expect(block).not.toContain("- [x]");
        expect(body).toContain("as `fix(viewer): keep the zoom when the diagram reloads`");
        expect(withBody(body)).toHaveLength(1);
        expect(withBody(body.replace("- [ ] `vscode`", "- [x] `vscode`"))).toEqual([]);
    });

    it("lists the merge view under VS Code only once the PR ticks vscode", () => {
        expect(
            resolveAttribution(
                {
                    title: "feat(bpmn-merge): restore the source's default with a restored flow (#7)",
                    files: mergeFiles,
                    body: template.replace("- [ ] `vscode`", "- [x] `vscode`"),
                },
                registry,
            ).groups,
        ).toEqual([
            {
                subject: "feat(bpmn-merge): restore the source's default with a restored flow (#7)",
                lines: ["vscode"],
            },
        ]);
    });
});
