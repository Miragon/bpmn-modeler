import { describe, expect, it } from "vitest";

import type { CommitRecord, FileChange } from "../../history/domain/commitHistory";
import type { FileMeasure } from "../../sourceFiles/domain/fileMeasure";
import { hotspotFindings, rankHotspots } from "./hotspots";

const OFTEN = "libs/core/src/service/Often.ts";
const LARGE = "libs/core/src/service/Large.ts";
const SMALL = "libs/core/src/service/Small.ts";

let commitCount = 0;

function commit(changes: readonly FileChange[], subject = "feat: change"): CommitRecord {
    commitCount += 1;
    return { commit: `c${commitCount}`, subject, changes };
}

function changed(...paths: string[]): CommitRecord {
    return commit(paths.map((path) => ({ kind: "modified", path })));
}

function file(path: string, codeLines: number, complexity?: number): FileMeasure {
    return {
        path,
        codeLines,
        functions: complexity === undefined ? [] : [{ name: "handle", line: 7, complexity }],
        barrel: false,
    };
}

function barrel(path: string, codeLines: number): FileMeasure {
    return { ...file(path, codeLines), barrel: true };
}

describe("the hotspot ranking", () => {
    it("ranks a file changed in 6 of 7 commits above a larger file changed once", () => {
        const window = [changed(LARGE), ...Array.from({ length: 6 }, () => changed(OFTEN))];

        expect(
            rankHotspots(window, [file(OFTEN, 100), file(LARGE, 500)]).map(({ file, rank }) => [
                file.path,
                rank,
            ]),
        ).toEqual([
            [OFTEN, 1],
            [LARGE, 2],
        ]);
    });

    it("scores revisions × code lines and breaks ties by revisions, code lines, then path", () => {
        const window = [
            changed(OFTEN, LARGE, SMALL),
            changed(OFTEN, SMALL),
            changed(OFTEN),
            changed(OFTEN),
        ];

        expect(
            rankHotspots(window, [
                file(SMALL, 200),
                file(LARGE, 400),
                file(OFTEN, 100),
                file("libs/core/src/service/Also.ts", 100),
            ]).map(({ file, revisions, score }) => [file.path, revisions, file.codeLines, score]),
        ).toEqual([
            [OFTEN, 4, 100, 400],
            [SMALL, 2, 200, 400],
            [LARGE, 1, 400, 400],
        ]);
    });

    it("breaks a full tie by path", () => {
        const window = [changed(SMALL, LARGE)];

        expect(
            rankHotspots(window, [file(SMALL, 5), file(LARGE, 5)]).map(({ file }) => file.path),
        ).toEqual([LARGE, SMALL]);
    });

    it("follows a rename to today's path", () => {
        const window = [
            commit([{ kind: "renamed", previousPath: "libs/core/src/Old.ts", path: OFTEN }]),
            changed("libs/core/src/Old.ts"),
            changed("libs/core/src/Old.ts"),
        ];

        expect(rankHotspots(window, [file(OFTEN, 10)])).toMatchObject([
            { file: { path: OFTEN }, revisions: 3 },
        ]);
    });

    it("counts no mechanical commit", () => {
        const window = [
            commit([{ kind: "modified", path: OFTEN }], "chore(deps): bump"),
            commit([{ kind: "modified", path: OFTEN }], "style: format"),
            changed(OFTEN),
        ];

        expect(rankHotspots(window, [file(OFTEN, 10)])).toMatchObject([{ revisions: 1 }]);
    });

    it("keeps the top entries only and leaves out files that never changed", () => {
        const paths = Array.from({ length: 4 }, (_, index) => `libs/core/src/f${index}.ts`);
        const window = [changed(...paths.slice(0, 3))];

        expect(
            rankHotspots(window, [...paths.map((path, index) => file(path, 10 + index))], 2).map(
                (hotspot) => hotspot.file.path,
            ),
        ).toEqual([paths[2], paths[1]]);
    });

    it("leaves out a barrel with the top score, so the next file takes the last place", () => {
        const index = "libs/core/src/index.ts";
        const window = Array.from({ length: 6 }, () => changed(index, OFTEN, LARGE, SMALL));

        expect(
            rankHotspots(
                window,
                [barrel(index, 160), file(OFTEN, 100), file(LARGE, 90), file(SMALL, 80)],
                2,
            ).map(({ file, rank }) => [file.path, rank]),
        ).toEqual([
            [OFTEN, 1],
            [LARGE, 2],
        ]);
    });
});

describe("the hotspot findings", () => {
    it("state the score as its product and point at the most complex function", () => {
        const [hotspot] = rankHotspots(
            Array.from({ length: 50 }, () => changed(OFTEN)),
            [file(OFTEN, 384, 16)],
        );

        expect(hotspotFindings([hotspot])).toEqual([
            {
                key: OFTEN,
                path: OFTEN,
                line: 7,
                message: "50 revisions × 384 code lines = 19,200; highest complexity 16 (handle)",
                rank: 1,
            },
        ]);
    });

    it("say one revision and no function", () => {
        const [hotspot] = rankHotspots([changed(SMALL)], [file(SMALL, 3)]);

        expect(hotspotFindings([hotspot])[0]).toMatchObject({
            line: 1,
            message: "1 revision × 3 code lines = 3; no function",
        });
    });
});
