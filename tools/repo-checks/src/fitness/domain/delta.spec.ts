import { describe, expect, it } from "vitest";

import { markDelta, type Rename } from "./delta";
import type { Finding } from "./finding";

function at(key: string, line: number, path = `src/${key}.ts`): Finding {
    return { key, path, line, message: `${key} at ${line}` };
}

function naming(key: string, paths: readonly string[], fields: Partial<Finding> = {}): Finding {
    return { key, path: paths[0], line: 1, message: key, paths, ...fields };
}

function statuses(
    head: readonly Finding[],
    base: readonly Finding[],
    renames: readonly Rename[] = [],
) {
    const { findings, resolved } = markDelta(head, base, renames);
    return {
        findings: findings.map(({ key, line, status }) => `${status}:${key}@${line}`),
        resolved: resolved.map(({ key, line }) => `${key}@${line}`),
    };
}

describe("the delta against the merge base", () => {
    it.each([
        {
            case: "a finding whose lines moved stays existing",
            head: [at("A", 40)],
            base: [at("A", 3)],
            expected: { findings: ["existing:A@40"], resolved: [] },
        },
        {
            case: "a finding the base lacks is new",
            head: [at("A", 1), at("B", 1)],
            base: [at("A", 1)],
            expected: { findings: ["existing:A@1", "new:B@1"], resolved: [] },
        },
        {
            case: "a base finding the head lacks is resolved",
            head: [],
            base: [at("A", 1)],
            expected: { findings: [], resolved: ["A@1"] },
        },
        {
            case: "a key found twice more often than in the base counts the extra one as new",
            head: [at("A", 1), at("A", 2), at("A", 3)],
            base: [at("A", 9)],
            expected: { findings: ["existing:A@1", "new:A@2", "new:A@3"], resolved: [] },
        },
        {
            case: "a key found less often than in the base resolves the rest",
            head: [at("A", 5)],
            base: [at("A", 1), at("A", 2), at("A", 3)],
            expected: { findings: ["existing:A@5"], resolved: ["A@2", "A@3"] },
        },
    ])("$case", ({ head, base, expected }) => {
        expect(statuses(head, base)).toEqual(expected);
    });

    it("orders findings by path, then line, whatever order the function returned", () => {
        expect(statuses([at("B", 1), at("A", 9), at("A", 2)], [])).toEqual({
            findings: ["new:A@2", "new:A@9", "new:B@1"],
            resolved: [],
        });
    });
});

describe("the delta across files renamed since the merge base", () => {
    const RENAME_A_TO_B: Rename = { previousPath: "src/a.ts", path: "src/b.ts" };

    it.each([
        {
            case: "a finding in a renamed file stays existing",
            head: [naming("src/b.ts — Save", ["src/b.ts"])],
            base: [naming("src/a.ts — Save", ["src/a.ts"])],
            renames: [RENAME_A_TO_B],
            expected: { findings: ["existing:src/b.ts — Save@1"], resolved: [] },
        },
        {
            case: "a finding in a renamed file that changed is new and its old one resolved",
            head: [naming("src/b.ts — Save all", ["src/b.ts"])],
            base: [naming("src/a.ts — Save", ["src/a.ts"])],
            renames: [RENAME_A_TO_B],
            expected: {
                findings: ["new:src/b.ts — Save all@1"],
                resolved: ["src/a.ts — Save@1"],
            },
        },
        {
            case: "a pair whose code-unit order the rename flips stays existing",
            head: [
                naming("src/b.ts ↔ src/c.ts", ["src/b.ts", "src/c.ts"], { pathOrder: "code-unit" }),
            ],
            base: [at("src/0.ts ↔ src/b.ts", 1)],
            renames: [{ previousPath: "src/0.ts", path: "src/c.ts" }],
            expected: { findings: ["existing:src/b.ts ↔ src/c.ts@1"], resolved: [] },
        },
        {
            case: "a pair whose files were both renamed stays existing",
            head: [
                naming("src/x.ts ↔ src/y.ts", ["src/x.ts", "src/y.ts"], { pathOrder: "code-unit" }),
            ],
            base: [at("src/a.ts ↔ src/b.ts", 1)],
            renames: [
                { previousPath: "src/a.ts", path: "src/y.ts" },
                { previousPath: "src/b.ts", path: "src/x.ts" },
            ],
            expected: { findings: ["existing:src/x.ts ↔ src/y.ts@1"], resolved: [] },
        },
        {
            case: "a directed pair keeps its order through the rename",
            head: [naming("src/c.ts → src/b.ts", ["src/c.ts", "src/b.ts"])],
            base: [at("src/c.ts → src/a.ts", 1)],
            renames: [RENAME_A_TO_B],
            expected: { findings: ["existing:src/c.ts → src/b.ts@1"], resolved: [] },
        },
        {
            case: "a directed pair is not matched with its reverse",
            head: [naming("src/c.ts → src/b.ts", ["src/c.ts", "src/b.ts"])],
            base: [at("src/a.ts → src/c.ts", 1)],
            renames: [RENAME_A_TO_B],
            expected: {
                findings: ["new:src/c.ts → src/b.ts@1"],
                resolved: ["src/a.ts → src/c.ts@1"],
            },
        },
        {
            case: "two files that swapped names keep their findings",
            head: [
                naming("src/a.ts — Open", ["src/a.ts"]),
                naming("src/b.ts — Save", ["src/b.ts"]),
            ],
            base: [at("src/a.ts — Save", 1), at("src/b.ts — Open", 1)],
            renames: [RENAME_A_TO_B, { previousPath: "src/b.ts", path: "src/a.ts" }],
            expected: {
                findings: ["existing:src/a.ts — Open@1", "existing:src/b.ts — Save@1"],
                resolved: [],
            },
        },
        {
            case: "a finding that names no paths is not followed",
            head: [at("src/b.ts", 1, "src/b.ts")],
            base: [at("src/a.ts", 1, "src/a.ts")],
            renames: [RENAME_A_TO_B],
            expected: { findings: ["new:src/b.ts@1"], resolved: ["src/a.ts@1"] },
        },
        {
            case: "a finding whose key does not name its paths is not followed",
            head: [naming("Save", ["src/b.ts"])],
            base: [at("src/a.ts — Save", 1)],
            renames: [RENAME_A_TO_B],
            expected: { findings: ["new:Save@1"], resolved: ["src/a.ts — Save@1"] },
        },
    ])("$case", ({ head, base, renames, expected }) => {
        expect(statuses(head, base, renames)).toEqual(expected);
    });

    it("reports a new and a resolved finding without the paths they name", () => {
        const { findings, resolved } = markDelta(
            [naming("src/b.ts ↔ src/c.ts", ["src/b.ts", "src/c.ts"], { pathOrder: "code-unit" })],
            [naming("src/a.ts ↔ src/c.ts", ["src/a.ts", "src/c.ts"], { pathOrder: "code-unit" })],
            [],
        );

        expect({ findings, resolved }).toEqual({
            findings: [
                {
                    key: "src/b.ts ↔ src/c.ts",
                    path: "src/b.ts",
                    line: 1,
                    message: "src/b.ts ↔ src/c.ts",
                    status: "new",
                },
            ],
            resolved: [
                {
                    key: "src/a.ts ↔ src/c.ts",
                    path: "src/a.ts",
                    line: 1,
                    message: "src/a.ts ↔ src/c.ts",
                },
            ],
        });
    });
});
