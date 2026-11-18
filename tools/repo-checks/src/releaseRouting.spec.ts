import { describe, expect, it } from "vitest";

import releaseLines from "../../../.github/release-lines.json";
import {
    attributionFile,
    attributionMessage,
    auditReport,
    commitsSinceTags,
    derivedLines,
    missingAttributions,
    planAttributions,
    resolveAttribution,
    routingSummary,
    skipReason,
    syncedSha,
    type ReleaseLineRegistry,
} from "../../../.github/scripts/release-routing.mjs";

const registry: ReleaseLineRegistry = releaseLines;

/** A package and a host that bundles it, so a case states its own rules. */
const sample: ReleaseLineRegistry = {
    ignore: ["**/*.spec.ts", "**/README.md"],
    unreleased: ["tools/*"],
    lines: [
        {
            id: "package",
            componentPath: "release/package",
            ships: ["packages/lib/**", "libs/types/**", "!libs/types/src/merge.ts"],
            breaking: ["**"],
        },
        {
            id: "host",
            componentPath: "release/host",
            ships: ["apps/host/**", "packages/lib/**", "libs/types/**", "libs/shared/**"],
            breaking: ["apps/host/**"],
        },
    ],
};

describe("the lines a change's files reach", () => {
    it("lists every line that ships a file, in the registry's order", () => {
        expect(derivedLines(["libs/shared/src/a.ts", "libs/types/src/b.ts"], sample)).toEqual([
            "package",
            "host",
        ]);
    });

    it("reaches no line for an ignored file, also inside a shipped folder", () => {
        expect(derivedLines(["apps/host/src/a.spec.ts", "libs/types/README.md"], sample)).toEqual(
            [],
        );
    });

    it("leaves out a line whose `!` glob takes the file back", () => {
        expect(derivedLines(["libs/types/src/merge.ts"], sample)).toEqual(["host"]);
    });

    it("reaches no line for a file no line ships", () => {
        expect(derivedLines(["tools/checks/src/a.ts", "yarn.lock"], sample)).toEqual([]);
    });
});

describe("the attribution of a merged commit", () => {
    it("gives a feat its derived lines under its own title", () => {
        expect(
            resolveAttribution({ title: "feat(lib): add a", files: ["packages/lib/a.ts"] }, sample),
        ).toEqual({
            source: "derived",
            groups: [{ subject: "feat(lib): add a", lines: ["package", "host"] }],
        });
    });

    it("gives a fix its derived lines", () => {
        expect(
            resolveAttribution({ title: "fix: keep b", files: ["apps/host/b.ts"] }, sample).groups,
        ).toEqual([{ subject: "fix: keep b", lines: ["host"] }]);
    });

    it.each(["chore(lib): bump c", "refactor: move c", "docs: explain c", "release c"])(
        "attributes %s to no line",
        (title) => {
            expect(resolveAttribution({ title, files: ["packages/lib/c.ts"] }, sample)).toEqual({
                source: "derived",
                groups: [],
            });
        },
    );

    it("attributes a feat whose files no line ships to no line", () => {
        expect(
            resolveAttribution({ title: "feat: d", files: ["apps/host/d.spec.ts"] }, sample).groups,
        ).toEqual([]);
    });

    it("keeps a breaking mark only on the lines whose breaking globs match a file they ship", () => {
        expect(
            resolveAttribution(
                { title: "feat(host)!: drop e", files: ["apps/host/e.ts", "libs/shared/e.ts"] },
                sample,
            ).groups,
        ).toEqual([{ subject: "feat(host)!: drop e", lines: ["host"] }]);
        expect(
            resolveAttribution(
                { title: "feat(lib)!: drop f", files: ["packages/lib/f.ts"] },
                sample,
            ).groups,
        ).toEqual([
            { subject: "feat(lib)!: drop f", lines: ["package"] },
            { subject: "feat(lib): drop f", lines: ["host"] },
        ]);
    });

    it("strips a breaking mark that matches only an ignored file", () => {
        expect(
            resolveAttribution(
                { title: "fix!: g", files: ["apps/host/g.spec.ts", "libs/shared/g.ts"] },
                sample,
            ).groups,
        ).toEqual([{ subject: "fix: g", lines: ["host"] }]);
    });
});

describe("the attributions a line still lacks", () => {
    const commits = [
        { sha: "a1", title: "feat: a", files: ["packages/lib/a.ts"] },
        { sha: "b2", title: "chore: b", files: ["packages/lib/b.ts"] },
        { sha: "c3", title: "fix: c", files: ["apps/host/c.ts"] },
    ];

    it("lists each feat and fix with the lines no attribution names yet", () => {
        expect(missingAttributions(commits, [{ sha: "a1", lines: ["package"] }], sample)).toEqual([
            { sha: "a1", subject: "feat: a", lines: ["host"] },
            { sha: "c3", subject: "fix: c", lines: ["host"] },
        ]);
    });

    it("matches an attribution by the short sha its subject names", () => {
        expect(
            missingAttributions(
                [{ sha: "a1b2c3d4e5", title: "feat: a", files: ["packages/lib/a.ts"] }],
                [{ sha: "a1b2c3d", lines: ["package", "host"] }],
                sample,
            ),
        ).toEqual([]);
    });

    it("leaves out the lines that already released the commit", () => {
        expect(
            missingAttributions([{ ...commits[0], unreleasedLines: ["host"] }], [], sample),
        ).toEqual([{ sha: "a1", subject: "feat: a", lines: ["host"] }]);
    });

    it("lists nothing once every line is attributed, also across several attributions", () => {
        expect(
            missingAttributions(
                commits,
                [
                    { sha: "a1", lines: ["package"] },
                    { sha: "a1", lines: ["host"] },
                    { sha: "c3", lines: ["host"] },
                ],
                sample,
            ),
        ).toEqual([]);
    });
});

describe("the commits on main that are not routed", () => {
    it.each([
        { title: "feat(lib): add a (#12) [sync 1a2b3c4]", reason: "attribution commit" },
        { title: "chore: release main (#13)", reason: "release commit" },
        {
            title: "chore(main): release things",
            pullRequestHead: "release-please--branches--main",
            reason: "release commit",
        },
    ])("skips $title as a $reason", (commit) => {
        expect(skipReason(commit)).toBe(commit.reason);
    });

    it("routes a feat merged from a feature branch", () => {
        expect(skipReason({ title: "feat: a (#14)", pullRequestHead: "feat/a" })).toBeUndefined();
    });

    it("reads the short sha an attribution commit names", () => {
        expect(syncedSha("fix: b (#15) [sync 0f1e2d3]\n\nbody")).toBe("0f1e2d3");
        expect(syncedSha("fix: b (#15)")).toBeUndefined();
    });

    it("never attributes an attribution commit again, though its title is a feat", () => {
        expect(
            missingAttributions(
                [
                    {
                        sha: "e5",
                        title: "feat: a [sync a1a1a1a]",
                        files: ["release/host/ATTRIBUTION", "packages/lib/a.ts"],
                    },
                ],
                [],
                sample,
            ),
        ).toEqual([]);
    });
});

describe("the attribution commits", () => {
    it("carry the subject and the short sha of the commit they attribute", () => {
        expect(attributionMessage("feat: a (#16)", "0123456789abcdef")).toBe(
            "feat: a (#16) [sync 0123456]",
        );
    });

    it("change the ATTRIBUTION file of a line to the attributed commit", () => {
        const file = attributionFile("release/host", "0123456789abcdef");

        expect(file.path).toBe("release/host/ATTRIBUTION");
        expect(file.content).toMatch(/^# /);
        expect(file.content.endsWith("\nbundledCommit=0123456789abcdef\n")).toBe(true);
    });

    it("are planned per line group, in the commits' order, with the files each changes", () => {
        const { writes } = planAttributions(
            [
                {
                    sha: "a1aaaaaaaa",
                    title: "feat(lib)!: drop f (#1)",
                    files: ["packages/lib/f.ts"],
                },
                { sha: "b2bbbbbbbb", title: "fix: g (#2)", files: ["apps/host/g.ts"] },
            ],
            [],
            sample,
        );

        expect(
            writes.map(({ message, files }) => ({ message, files: files.map(({ path }) => path) })),
        ).toEqual([
            {
                message: "feat(lib)!: drop f (#1) [sync a1aaaaa]",
                files: ["release/package/ATTRIBUTION"],
            },
            {
                message: "feat(lib): drop f (#1) [sync a1aaaaa]",
                files: ["release/host/ATTRIBUTION"],
            },
            { message: "fix: g (#2) [sync b2bbbbb]", files: ["release/host/ATTRIBUTION"] },
        ]);
    });
});

describe("the commits since each line's last tag", () => {
    it("lists each commit once, oldest first, with the lines that have not released it", () => {
        expect(
            commitsSinceTags([
                { id: "package", shas: ["c3", "d4"] },
                { id: "host", shas: ["a1", "b2", "c3", "d4"] },
            ]),
        ).toEqual([
            { sha: "a1", unreleasedLines: ["host"] },
            { sha: "b2", unreleasedLines: ["host"] },
            { sha: "c3", unreleasedLines: ["package", "host"] },
            { sha: "d4", unreleasedLines: ["package", "host"] },
        ]);
    });

    it("lists nothing when every line is released at the head", () => {
        expect(commitsSinceTags([{ id: "package", shas: [] }])).toEqual([]);
    });
});

describe("the routing report", () => {
    const { decisions, writes } = planAttributions(
        [
            { sha: "a1aaaaaaaa", title: "feat: a | b (#1)", files: ["packages/lib/a.ts"] },
            { sha: "b2bbbbbbbb", title: "chore: c (#2)", files: ["packages/lib/c.ts"] },
            { sha: "c3cccccccc", title: "fix: d (#3)", files: ["apps/host/d.spec.ts"] },
            {
                sha: "d4dddddddd",
                title: "fix: e (#4) [sync a1aaaaa]",
                files: ["release/host/ATTRIBUTION"],
            },
        ],
        [{ sha: "a1aaaaa", lines: ["package"] }],
        sample,
    );

    it("states the decision for every commit", () => {
        expect(routingSummary("Sync", decisions)).toBe(
            [
                "### Sync",
                "",
                "| Commit | Title | Release lines |",
                "| --- | --- | --- |",
                "| a1aaaaa | feat: a \\| b (#1) | adds host; has package |",
                "| b2bbbbb | chore: c (#2) | none: not a feat or fix |",
                "| c3ccccc | fix: d (#3) | none: reaches no line |",
                "| d4ddddd | fix: e (#4) [sync a1aaaaa] | skipped: attribution commit |",
                "",
            ].join("\n"),
        );
    });

    it("says so when there is no commit to route", () => {
        expect(routingSummary("Sync", [])).toBe("### Sync\n\nNo commit to route.\n");
    });

    it("names each missing attribution and the run that adds it", () => {
        expect(auditReport(writes, "gh workflow run x.yml -f reconcile=true")).toBe(
            [
                "a1aaaaa feat: a | b (#1) lacks its attribution on host",
                "",
                "Add the missing attributions: gh workflow run x.yml -f reconcile=true",
            ].join("\n"),
        );
    });

    it("reports nothing when no attribution is missing", () => {
        expect(auditReport([], "gh workflow run x.yml")).toBe("");
    });
});

describe("the release lines of past changes", () => {
    it.each([
        { change: "a lockfile bump", files: ["yarn.lock"] },
        { change: "the root manifest", files: ["package.json"] },
        { change: "the agent instructions", files: ["AGENTS.md"] },
        { change: "a release commit", files: [".release-please-manifest.json"] },
        { change: "a workflow", files: [".github/workflows/build.yml"] },
        { change: "a test support fake", files: ["libs/modeler-core/src/testing/FakeHost.ts"] },
        { change: "a README in a shipped folder", files: ["packages/bpmn-modeler/README.md"] },
    ])("routes $change to no line", ({ files }) => {
        expect(derivedLines(files, registry)).toEqual([]);
    });

    it("keeps a host off its line when only one of its specs changed (a PR 2499-like change)", () => {
        expect(
            derivedLines(
                [
                    "apps/vscode-plugin/src/diff/adapter/in/DiffController.spec.ts",
                    "apps/intellij-plugin/src/main/kotlin/DiffRouter.kt",
                    "apps/intellij-plugin/src/test/kotlin/DiffRouterTest.kt",
                    "apps/modeler-bridge/src/handlers.ts",
                ],
                registry,
            ),
        ).toEqual(["intellij"]);
    });

    it("routes a webview change with a lockfile bump to the hosts, not the npm package (a PR 2484-like change)", () => {
        expect(
            derivedLines(
                ["yarn.lock", "apps/bpmn-webview/src/merge/view.ts", "libs/shared/src/protocol.ts"],
                registry,
            ),
        ).toEqual(["vscode", "intellij", "orca"]);
    });

    it("routes a change to the npm package and both plugins to all their lines (a PR 2347-like change)", () => {
        expect(
            derivedLines(
                [
                    "packages/bpmn-modeler/src/elementIds.ts",
                    "apps/vscode-plugin/src/modeler/settings.ts",
                    "apps/intellij-plugin/src/main/kotlin/Settings.kt",
                ],
                registry,
            ),
        ).toEqual(["bpmn-modeler", "vscode", "intellij", "orca"]);
    });

    it("routes a viewer fix in the npm package to it and every host that bundles it (a PR 2521-like change)", () => {
        expect(derivedLines(["packages/bpmn-modeler/src/viewer/DiffViewer.ts"], registry)).toEqual([
            "bpmn-modeler",
            "vscode",
            "intellij",
            "orca",
        ]);
    });

    it("routes the merge vocabulary to every line that ships the types library", () => {
        expect(derivedLines(["libs/modeler-types/src/mergeVocabulary.ts"], registry)).toEqual(
            derivedLines(["libs/modeler-types/src/index.ts"], registry),
        );
    });

    it("routes a VS Code walkthrough page, which the extension shows, to VS Code", () => {
        expect(derivedLines(["apps/vscode-plugin/media/walkthrough/learn.md"], registry)).toEqual([
            "vscode",
        ]);
    });

    it("keeps a breaking mark on the npm package for a change to an inlined library", () => {
        expect(
            resolveAttribution(
                {
                    title: "feat(modeler-types)!: rename a type",
                    files: ["libs/modeler-types/src/a.ts"],
                },
                registry,
            ).groups,
        ).toEqual([
            { subject: "feat(modeler-types)!: rename a type", lines: ["bpmn-modeler"] },
            {
                subject: "feat(modeler-types): rename a type",
                lines: ["vscode", "intellij", "orca", "dmn-modeler"],
            },
        ]);
    });

    it("keeps a breaking mark on a host only for a change in its own folder", () => {
        expect(
            resolveAttribution(
                {
                    title: "feat(vscode-plugin)!: drop a setting",
                    files: ["apps/vscode-plugin/package.json", "libs/shared/src/settings.ts"],
                },
                registry,
            ).groups,
        ).toEqual([
            { subject: "feat(vscode-plugin)!: drop a setting", lines: ["vscode"] },
            { subject: "feat(vscode-plugin): drop a setting", lines: ["intellij", "orca"] },
        ]);
    });

    it("attributes a chore to no line, whatever it touches", () => {
        expect(
            resolveAttribution(
                {
                    title: "chore(deps): bump bpmn-js",
                    files: ["packages/bpmn-modeler/package.json"],
                },
                registry,
            ).groups,
        ).toEqual([]);
    });
});
