import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import releaseLines from "../../../.github/release-lines.json";
import {
    parseShipsIn,
    planAttributions,
    resolveAttribution,
    routingSummary,
    suggest,
    validate,
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
        },
        {
            id: "host",
            componentPath: "release/host",
            ships: ["apps/host/**", "packages/lib/**", "libs/types/**", "libs/merge/**"],
            breaking: ["apps/host/**"],
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

    it("asks a feat that reaches two lines to declare them, with the block to paste", () => {
        const [error, ...rest] = pr({});

        expect(rest).toEqual([]);
        expect(error).toContain("reaches `package`, `host` by its files");
        expect(error).toContain("by wiring");
        expect(error).toContain(
            suggest({ title: "feat(types): add a", files: shared, registry: sample }),
        );
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

    it("passes a wording that is a feat or fix subject, also a breaking one", () => {
        expect(pr({ body: shipsIn("- [x] `host` as `fix(viewer)!: keep the zoom`") })).toEqual([]);
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

describe("the suggested Ships in block", () => {
    it("ticks the derived lines and leaves the others and none unticked", () => {
        expect(suggest({ title: "feat: a", files: ["libs/merge/m.ts"], registry: sample })).toBe(
            ["## Ships in", "", "- [ ] `package`", "- [x] `host`", "- [ ] `none`", ""].join("\n"),
        );
    });

    it("parses back to the derived lines", () => {
        const block = suggest({ title: "feat: a", files: ["libs/types/a.ts"], registry: sample });

        expect(parseShipsIn(block, sample).lines).toEqual(["package", "host"]);
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
