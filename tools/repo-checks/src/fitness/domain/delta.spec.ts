import { describe, expect, it } from "vitest";

import { markDelta } from "./delta";
import type { Finding } from "./finding";

function at(key: string, line: number, path = `src/${key}.ts`): Finding {
    return { key, path, line, message: `${key} at ${line}` };
}

function statuses(head: readonly Finding[], base: readonly Finding[]) {
    const { findings, resolved } = markDelta(head, base);
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
        {
            case: "a renamed file shows as new and its old finding as resolved",
            head: [{ ...at("A", 1, "src/renamed.ts"), key: "src/renamed.ts" }],
            base: [{ ...at("A", 1, "src/old.ts"), key: "src/old.ts" }],
            expected: { findings: ["new:src/renamed.ts@1"], resolved: ["src/old.ts@1"] },
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
