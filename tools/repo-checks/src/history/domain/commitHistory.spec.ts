import { describe, expect, it } from "vitest";

import {
    changesetsAtTodaysPaths,
    type CommitRecord,
    type FileChange,
    HISTORY_WINDOW,
    historyWindow,
    isMechanicalCommit,
} from "./commitHistory";

function commit(name: string, ...changes: FileChange[]): CommitRecord {
    return { commit: name, subject: `feat: ${name}`, changes };
}

const modified = (path: string): FileChange => ({ kind: "modified", path });
const added = (path: string): FileChange => ({ kind: "added", path });
const deleted = (path: string): FileChange => ({ kind: "deleted", path });
const renamed = (previousPath: string, path: string): FileChange => ({
    kind: "renamed",
    path,
    previousPath,
});

function pathsByCommit(
    commitsNewestFirst: readonly CommitRecord[],
    todaysFiles: readonly string[],
): Record<string, readonly string[]> {
    return Object.fromEntries(
        changesetsAtTodaysPaths(commitsNewestFirst, todaysFiles).map(({ commit, paths }) => [
            commit,
            paths,
        ]),
    );
}

describe("changesets at today's paths", () => {
    it.each([
        {
            case: "keeps a file that still exists at its path",
            commits: [commit("c1", modified("a.ts"), modified("b.ts"))],
            today: ["a.ts", "b.ts"],
            paths: { c1: ["a.ts", "b.ts"] },
        },
        {
            case: "follows a rename to today's path",
            commits: [commit("c2", renamed("old.ts", "new.ts")), commit("c1", modified("old.ts"))],
            today: ["new.ts"],
            paths: { c2: ["new.ts"], c1: ["new.ts"] },
        },
        {
            case: "follows a chain of renames",
            commits: [
                commit("c3", renamed("b.ts", "c.ts")),
                commit("c2", renamed("a.ts", "b.ts")),
                commit("c1", modified("a.ts")),
            ],
            today: ["c.ts"],
            paths: { c3: ["c.ts"], c2: ["c.ts"], c1: ["c.ts"] },
        },
        {
            case: "drops a file that no longer exists",
            commits: [commit("c2", deleted("gone.ts")), commit("c1", modified("gone.ts"))],
            today: [],
            paths: { c2: [], c1: [] },
        },
        {
            case: "keeps the history of a deleted and re-added path apart",
            commits: [
                commit("c3", added("p.ts")),
                commit("c2", deleted("p.ts")),
                commit("c1", modified("p.ts")),
            ],
            today: ["p.ts"],
            paths: { c3: ["p.ts"], c2: [], c1: [] },
        },
        {
            case: "follows two files that swap paths in one commit",
            commits: [
                commit("c2", renamed("a.ts", "b.ts"), renamed("b.ts", "a.ts")),
                commit("c1", modified("a.ts")),
            ],
            today: ["a.ts", "b.ts"],
            paths: { c2: ["a.ts", "b.ts"], c1: ["b.ts"] },
        },
        {
            case: "follows a rename whose old path is re-added in the same commit",
            commits: [
                commit("c2", renamed("p.ts", "q.ts"), added("p.ts")),
                commit("c1", modified("p.ts")),
            ],
            today: ["p.ts", "q.ts"],
            paths: { c2: ["p.ts", "q.ts"], c1: ["q.ts"] },
        },
        {
            case: "drops a rename of a file that is gone today",
            commits: [
                commit("c3", deleted("b.ts")),
                commit("c2", renamed("a.ts", "b.ts")),
                commit("c1", modified("a.ts")),
            ],
            today: [],
            paths: { c3: [], c2: [], c1: [] },
        },
    ])("$case", ({ commits, today, paths }) => {
        expect(pathsByCommit(commits, today)).toEqual(paths);
    });

    it("keeps every commit's subject", () => {
        expect(
            changesetsAtTodaysPaths([commit("c1", modified("a.ts"))], ["a.ts"]).map(
                ({ subject }) => subject,
            ),
        ).toEqual(["feat: c1"]);
    });
});

describe("a mechanical commit", () => {
    it.each([
        { subject: "chore(deps): update dependency vite to v8.3.4", mechanical: true },
        { subject: "chore(main): release vscode 1.14.0", mechanical: true },
        { subject: "chore(format): run prettier over the repository", mechanical: true },
        { subject: "chore(deps)!: drop Node 20", mechanical: true },
        { subject: "style: reorder imports", mechanical: true },
        { subject: "style(bpmn-webview): reorder imports", mechanical: true },
        { subject: "fix(deps): bump bpmnlint to 11.14.0", mechanical: false },
        { subject: "chore(release): combine release-please prs into one", mechanical: false },
        { subject: "chore: tidy the readme", mechanical: false },
        { subject: "feat(bpmn-modeler): add a mode menu", mechanical: false },
        { subject: "styles: not a type", mechanical: false },
    ])("is $subject: $mechanical", ({ subject, mechanical }) => {
        expect(isMechanicalCommit(subject)).toBe(mechanical);
    });
});

describe("the history window", () => {
    const commits = (count: number) =>
        Array.from({ length: count }, (_, index) => commit(`c${index}`));

    it("holds the newest commits once one more proves the oldest has a parent", () => {
        const window = historyWindow(commits(HISTORY_WINDOW + 1));

        expect(window.kind === "window" && window.commits.map(({ commit }) => commit)).toEqual(
            commits(HISTORY_WINDOW).map(({ commit }) => commit),
        );
    });

    it("is too short without the parent of the oldest", () => {
        expect(historyWindow(commits(HISTORY_WINDOW))).toEqual({
            kind: "tooShort",
            reason: `${HISTORY_WINDOW} first-parent commits reach back from here; the window needs ${HISTORY_WINDOW} and the parent of the oldest`,
        });
    });
});
