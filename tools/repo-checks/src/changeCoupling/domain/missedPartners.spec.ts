import { describe, expect, it } from "vitest";

import type { CommitRecord, FileChange } from "../../history/domain/commitHistory";
import {
    MISSED_PARTNER_THRESHOLDS,
    type MissedPartner,
    type MissedPartnersInput,
    missedPartners,
    missedPartnersOfChange,
} from "./missedPartners";
import type { SourceLayout } from "./sourceLayout";

const A = "libs/core/src/a.ts";
const B = "libs/core/src/b.ts";
const C = "libs/core/src/c.ts";
const FILLER = "libs/core/src/filler.ts";

function times(count: number, paths: readonly string[], subject = "feat: change") {
    return Array.from({ length: count }, () => ({ subject, paths }));
}

function find(overrides: Partial<MissedPartnersInput>): MissedPartner[] {
    const history = overrides.history ?? [];
    return missedPartners({
        change: [A],
        history,
        measuredFiles: new Set([A, B, C, FILLER]),
        thresholds: MISSED_PARTNER_THRESHOLDS,
        ...overrides,
    });
}

// B changed in 6 of 7 changes to A; 22 filler changes raise the lift to 6 × 29 ÷ (7 × 6) = 4.1.
const A_WITH_B = [...times(6, [A, B]), ...times(1, [A]), ...times(22, [FILLER])];

describe("missed partners", () => {
    it("warns when the change touches a file without the partner that changed in 6 of its 7 changes", () => {
        expect(find({ history: A_WITH_B })).toEqual([
            {
                file: A,
                partner: B,
                sharedChanges: 6,
                fileRevisions: 7,
                partnerRevisions: 6,
                countedChangesets: 29,
            },
        ]);
    });

    it.each([
        { case: "the change touches the partner too", change: [A, B], history: A_WITH_B },
        {
            case: "the pair shares 4 changes",
            change: [A],
            history: [...times(4, [A, B]), ...times(30, [FILLER])],
        },
        {
            case: "the partner changes in most commits (18 of 20, lift 1.1)",
            change: [A],
            history: [...times(6, [A, B]), ...times(12, [B]), ...times(2, [FILLER])],
        },
        {
            // 6 shared of 11 revisions of A is 55 %.
            case: "the confidence is below 60 %",
            change: [A],
            history: [...times(6, [A, B]), ...times(5, [A]), ...times(200, [FILLER])],
        },
        {
            case: "the shared changes are mechanical commits",
            change: [A],
            history: [...times(6, [A, B], "chore(deps): bump"), ...times(22, [FILLER])],
        },
        {
            case: "the shared changes hold more than 30 read files",
            change: [A],
            history: [
                ...times(6, [
                    A,
                    B,
                    ...Array.from({ length: 29 }, (_, index) => `libs/core/src/f${index}.ts`),
                ]),
                ...times(22, [FILLER]),
            ],
        },
    ])("does not warn when $case", ({ change, history }) => {
        expect(
            find({
                change,
                history,
                measuredFiles: new Set(history.flatMap(({ paths }) => paths)),
            }),
        ).toEqual([]);
    });

    it("warns at exactly 60 % confidence and a lift of exactly 4", () => {
        // 6 of 10 changes to A; lift 6 × 40 ÷ (10 × 6) = 4.
        const history = [...times(6, [A, B]), ...times(4, [A]), ...times(30, [FILLER])];

        expect(find({ history })).toEqual([
            expect.objectContaining({ sharedChanges: 6, fileRevisions: 10, countedChangesets: 40 }),
        ]);
    });

    it("does not warn just below a lift of 4", () => {
        const history = [...times(6, [A, B]), ...times(4, [A]), ...times(29, [FILLER])];

        expect(find({ history })).toEqual([]);
    });

    it("does not count a commit without a read file", () => {
        const history = [...A_WITH_B.slice(0, 7), ...times(22, ["docs/page.md"])];

        expect(find({ history })).toEqual([]);
    });

    it.each([
        { case: "a file", change: [A], measuredFiles: new Set([B, FILLER]) },
        { case: "a partner", change: [A], measuredFiles: new Set([A, FILLER]) },
    ])("never names an unread file as $case", ({ change, measuredFiles }) => {
        expect(find({ change, history: A_WITH_B, measuredFiles })).toEqual([]);
    });

    it("sorts the partners of one file", () => {
        const history = [...times(6, [A, C, B]), ...times(80, [FILLER])];

        expect(find({ history }).map(({ partner }) => partner)).toEqual([B, C]);
    });

    it("sorts by file, then partner", () => {
        const history = [
            ...times(6, [A, B, C]),
            ...times(6, [B, C]),
            ...times(1, [A]),
            ...times(80, [FILLER]),
        ];

        const pairs = find({ change: [B, A], history }).map(({ file, partner }) => [file, partner]);

        expect(pairs).toEqual([
            [A, C],
            [B, C],
        ]);
    });
});

const LAYOUT: SourceLayout = {
    files: [A, B, FILLER],
    barrels: [],
    links: [],
    workspaces: [
        { dir: "libs/core", compositionFiles: [], namedPaths: [], contributesToHost: false },
    ],
};

function records(changesets: readonly { paths: readonly string[] }[]): CommitRecord[] {
    return changesets.map(({ paths }, index) => ({
        commit: `c${index}`,
        subject: "feat: change",
        changes: paths.map((path): FileChange => ({ kind: "modified", path })),
    }));
}

describe("missed partners of the branch's change", () => {
    it("follows a rename on the branch into the history", () => {
        const OLD_A = "libs/core/src/old-a.ts";
        const history = records(
            A_WITH_B.map(({ paths }) => ({
                paths: paths.map((path) => (path === A ? OLD_A : path)),
            })),
        );

        const pairs = missedPartnersOfChange(
            LAYOUT,
            [{ kind: "renamed", previousPath: OLD_A, path: A }],
            history,
        );

        expect(pairs).toEqual([expect.objectContaining({ file: A, partner: B, sharedChanges: 6 })]);
    });

    it.each([
        {
            case: "a deleted file",
            change: [{ kind: "deleted", path: A }],
            files: [B, FILLER],
        },
        {
            case: "a deleted partner",
            change: [{ kind: "modified", path: A }],
            files: [A, FILLER],
        },
        {
            case: "an added file, which has no history",
            change: [{ kind: "added", path: A }],
            files: [A, B, FILLER],
        },
        {
            case: "everything for an empty change, whose newest record is no branch",
            change: [],
            files: [A, B, FILLER],
        },
    ] satisfies { case: string; change: FileChange[]; files: string[] }[])(
        "drops $case",
        ({ change, files }) => {
            expect(missedPartnersOfChange({ ...LAYOUT, files }, change, records(A_WITH_B))).toEqual(
                [],
            );
        },
    );

    it("warns for a modified file", () => {
        expect(
            missedPartnersOfChange(LAYOUT, [{ kind: "modified", path: A }], records(A_WITH_B)),
        ).toEqual([expect.objectContaining({ file: A, partner: B })]);
    });
});
