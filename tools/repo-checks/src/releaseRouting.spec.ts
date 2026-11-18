import { describe, expect, it } from "vitest";

import releaseLines from "../../../.github/release-lines.json";
import {
    derivedLines,
    missingAttributions,
    resolveAttribution,
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
