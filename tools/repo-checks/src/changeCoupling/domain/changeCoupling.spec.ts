import { describe, expect, it } from "vitest";

import { changesetsAtTodaysPaths, type CommitRecord } from "../../history/domain/commitHistory";
import {
    CODE_MAAT_THRESHOLDS,
    type ChangeCouplingInput,
    type CoupledPair,
    measureChangeCoupling,
} from "./changeCoupling";

const A = "libs/core/src/a.ts";
const B = "libs/core/src/b.ts";
const PORT = "libs/core/src/port/hostPorts.ts";

let commitCount = 0;

function changeset(paths: readonly string[], subject = "feat: change") {
    commitCount += 1;
    return { commit: `c${commitCount}`, subject, paths };
}

function times(count: number, paths: readonly string[], subject?: string) {
    return Array.from({ length: count }, () => changeset(paths, subject));
}

function measure(overrides: Partial<ChangeCouplingInput>): CoupledPair[] {
    const changesets = overrides.changesets ?? [];
    return measureChangeCoupling({
        changesets,
        measuredFiles: new Set(changesets.flatMap(({ paths }) => paths)),
        links: [],
        workspaceDirs: ["libs/core", "libs/shared", "apps/intellij-plugin", "apps/vscode-plugin"],
        compositionRoots: new Set(),
        thresholds: CODE_MAAT_THRESHOLDS,
        ...overrides,
    });
}

function pairOf(
    pairs: readonly CoupledPair[],
    left: string,
    right: string,
): CoupledPair | undefined {
    return pairs.find(({ files }) => files[0] === left && files[1] === right);
}

describe("change coupling", () => {
    it("reports two files that change together in 5 of 6 commits without an import", () => {
        const pairs = measure({ changesets: [...times(5, [A, B]), changeset([A])] });

        expect(pairs).toEqual([
            {
                files: [A, B],
                sharedChanges: 5,
                revisions: [6, 5],
                degreePercent: 91,
                coupling: { kind: "hidden", group: "within-workspace" },
                compositionRoots: [],
            },
        ]);
    });

    it.each([
        { direction: "the first imports the second", links: [{ from: A, to: B }] },
        { direction: "the second imports the first", links: [{ from: B, to: A }] },
    ])("reads the pair as linked when $direction", ({ links }) => {
        const pairs = measure({ changesets: times(5, [A, B]), links });

        expect(pairOf(pairs, A, B)?.coupling).toEqual({ kind: "linked" });
    });

    it("does not report 4 shared changes", () => {
        expect(measure({ changesets: times(4, [A, B]) })).toEqual([]);
    });

    it("does not report a degree below 30 %", () => {
        // 5 shared of a mean of 17.5 revisions is 28.6 %.
        const pairs = measure({
            changesets: [...times(5, [A, B]), ...times(12, [A]), ...times(12, [B]), changeset([B])],
        });

        expect(pairs).toEqual([]);
    });

    it("reports a degree of exactly 30 %", () => {
        // 6 shared of a mean of 20 revisions.
        const pairs = measure({
            changesets: [...times(6, [A, B]), ...times(14, [A]), ...times(14, [B])],
        });

        expect(pairOf(pairs, A, B)?.degreePercent).toBe(30);
    });

    it("does not count a changeset of more than 30 measured files", () => {
        const many = Array.from({ length: 29 }, (_, index) => `libs/core/src/f${index}.ts`);
        const pairs = measure({
            changesets: [...times(4, [A, B]), changeset([A, B, ...many])],
        });

        expect(pairs).toEqual([]);
    });

    it("counts a changeset of 30 measured files, whatever else it changes", () => {
        const many = Array.from({ length: 28 }, (_, index) => `libs/core/src/f${index}.ts`);
        const unmeasured = Array.from({ length: 10 }, (_, index) => `docs/page${index}.md`);
        const changesets = [...times(4, [A, B]), changeset([A, B, ...many, ...unmeasured])];
        const pairs = measure({
            changesets,
            measuredFiles: new Set([A, B, ...many]),
        });

        expect(pairOf(pairs, A, B)?.sharedChanges).toBe(5);
    });

    it.each([
        "chore(deps): update dependency vite",
        "chore(main): release vscode 1.14.0",
        "chore(format): run prettier",
        "style: reorder imports",
    ])("does not count the mechanical commit %s", (subject) => {
        const pairs = measure({ changesets: [...times(4, [A, B]), changeset([A, B], subject)] });

        expect(pairs).toEqual([]);
    });

    it("follows a rename to today's path", () => {
        const commits: CommitRecord[] = [
            {
                commit: "r",
                subject: "refactor: move a",
                changes: [{ kind: "renamed", previousPath: "libs/core/src/old.ts", path: A }],
            },
            ...Array.from({ length: 5 }, (_, index) => ({
                commit: `o${index}`,
                subject: "feat: change",
                changes: [
                    { kind: "modified" as const, path: "libs/core/src/old.ts" },
                    { kind: "modified" as const, path: B },
                ],
            })),
        ];

        const pairs = measure({ changesets: changesetsAtTodaysPaths(commits, [A, B]) });

        expect(pairOf(pairs, A, B)?.sharedChanges).toBe(5);
    });

    it("follows a rename inside a skipped changeset", () => {
        const many = Array.from({ length: 40 }, (_, index) => ({
            kind: "renamed" as const,
            previousPath: `libs/core/old/f${index}.ts`,
            path: `libs/core/src/f${index}.ts`,
        }));
        const commits: CommitRecord[] = [
            {
                commit: "move",
                subject: "refactor: move everything",
                changes: [
                    { kind: "renamed", previousPath: "libs/core/old/a.ts", path: A },
                    ...many,
                ],
            },
            ...Array.from({ length: 5 }, (_, index) => ({
                commit: `o${index}`,
                subject: "feat: change",
                changes: [
                    { kind: "modified" as const, path: "libs/core/old/a.ts" },
                    { kind: "modified" as const, path: B },
                ],
            })),
        ];
        const today = [A, B, ...many.map(({ path }) => path)];

        const pairs = measure({
            changesets: changesetsAtTodaysPaths(commits, today),
            measuredFiles: new Set(today),
        });

        expect(pairOf(pairs, A, B)).toMatchObject({ sharedChanges: 5, revisions: [5, 5] });
    });

    it("explains a pair by a shared import that changed in at least half of their shared changes", () => {
        const pairs = measure({
            changesets: [...times(3, [A, B, PORT]), ...times(3, [A, B])],
            links: [
                { from: A, to: PORT },
                { from: B, to: PORT },
            ],
        });

        expect(pairOf(pairs, A, B)?.coupling).toEqual({
            kind: "explained",
            by: PORT,
            coChanges: 3,
        });
    });

    it("keeps a pair hidden when the shared import changed in less than half of their shared changes", () => {
        const pairs = measure({
            changesets: [...times(2, [A, B, PORT]), ...times(3, [A, B])],
            links: [
                { from: A, to: PORT },
                { from: B, to: PORT },
            ],
        });

        expect(pairOf(pairs, A, B)?.coupling.kind).toBe("hidden");
    });

    it("explains by the shared import that changed most with the pair, the first path on a tie", () => {
        const other = "libs/core/src/port/a-ports.ts";
        const third = "libs/core/src/port/z-ports.ts";
        const links = [A, B].flatMap((from) => [PORT, other, third].map((to) => ({ from, to })));

        const pairs = measure({
            changesets: [
                ...times(3, [A, B, PORT, third]),
                ...times(1, [A, B, other, third]),
                ...times(1, [A, B, other, PORT]),
            ],
            links,
        });

        expect(pairOf(pairs, A, B)?.coupling).toEqual({
            kind: "explained",
            by: PORT,
            coChanges: 4,
        });
    });

    it("does not explain a pair by a file only one of them imports", () => {
        const pairs = measure({
            changesets: times(5, [A, B, PORT]),
            links: [{ from: A, to: PORT }],
        });

        expect(pairOf(pairs, A, B)?.coupling.kind).toBe("hidden");
    });

    it.each([
        {
            group: "kotlin-only",
            files: [
                "apps/intellij-plugin/src/main/kotlin/io/x/Bridge.kt",
                "apps/intellij-plugin/src/main/kotlin/io/x/Editor.kt",
            ],
        },
        {
            group: "across-languages",
            files: ["apps/intellij-plugin/src/main/kotlin/io/x/Bridge.kt", "libs/core/src/a.ts"],
        },
        {
            group: "across-languages",
            files: ["libs/core/src/a.ts", "libs/core/src/targets.schema.json"],
        },
        {
            group: "across-workspaces",
            files: ["apps/vscode-plugin/src/a.ts", "libs/shared/src/b.mjs"],
        },
        { group: "within-workspace", files: ["libs/core/src/a.ts", "libs/core/tools/build.mjs"] },
    ])("puts $files.0 ↔ $files.1 in $group", ({ group, files }) => {
        const pairs = measure({ changesets: times(5, files) });

        expect(pairOf(pairs, files[0], files[1])?.coupling).toEqual({ kind: "hidden", group });
    });

    it("marks the composition roots of a pair, never drops it", () => {
        const pairs = measure({ changesets: times(5, [A, B]), compositionRoots: new Set([B]) });

        expect(pairOf(pairs, A, B)?.compositionRoots).toEqual([B]);
    });

    it("lists pairs by their paths", () => {
        const C = "libs/core/src/c.ts";
        const pairs = measure({ changesets: [...times(5, [B, C]), ...times(5, [A, C])] });

        expect(pairs.map(({ files }) => files)).toEqual([
            [A, C],
            [B, C],
        ]);
    });
});
