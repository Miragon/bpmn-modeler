import { readCodeLines, readFunctionComplexities, runsNoCode } from "@miragon/architecture-testing";
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
        runsNoCode: false,
    };
}

function measured(path: string, source: string): FileMeasure {
    return {
        path,
        codeLines: readCodeLines(path, source),
        functions: readFunctionComplexities(path, source),
        runsNoCode: runsNoCode(path, source),
    };
}

const MODULE = "libs/core/src/module.ts";
const LABELS = 'export const LABELS = {\n    save: "Save",\n    close: "Close",\n};\n';

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

    const moduleChangedMost = [
        ...Array.from({ length: 6 }, () => changed(MODULE)),
        changed(OFTEN, LARGE, SMALL),
    ];

    it.each([
        { form: "a table of constants", source: LABELS },
        {
            form: "a type-only file",
            source: 'export interface Message {\n    kind: "save";\n}\nexport type Reply = Message | undefined;\n',
        },
        {
            form: "a barrel",
            source: 'export * from "./labels";\nexport { Message } from "./message";\n',
        },
    ])(
        "leaves out a module that runs no code, $form, with the top score, so the next file takes the last place",
        ({ source }) => {
            expect(
                rankHotspots(
                    moduleChangedMost,
                    [measured(MODULE, source), file(OFTEN, 10), file(LARGE, 9), file(SMALL, 8)],
                    2,
                ).map(({ file, rank }) => [file.path, rank]),
            ).toEqual([
                [OFTEN, 1],
                [LARGE, 2],
            ]);
        },
    );

    it.each([
        {
            form: "a function beside a table of constants",
            source: `${LABELS}export function label(key: keyof typeof LABELS): string {\n    return LABELS[key];\n}\n`,
        },
        {
            form: "a class that only holds its fields",
            source: "export class SaveCommand {\n    constructor(readonly content: string) {}\n}\n",
        },
        {
            form: "a table built by a call, with no function",
            source: 'export const KEYS = new Set([\n    "save",\n    "close",\n]);\n',
        },
    ])("ranks a module that runs code, $form", ({ source }) => {
        expect(
            rankHotspots(moduleChangedMost, [measured(MODULE, source), file(OFTEN, 10)]).map(
                ({ file, rank }) => [file.path, rank],
            ),
        ).toEqual([
            [MODULE, 1],
            [OFTEN, 2],
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
                paths: [OFTEN],
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
