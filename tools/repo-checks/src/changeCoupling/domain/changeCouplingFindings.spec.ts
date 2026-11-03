import { describe, expect, it } from "vitest";

import type { CoupledPair } from "./changeCoupling";
import { CHANGE_COUPLING_GROUPS, changeCouplingFindings } from "./changeCouplingFindings";

const PAIR: CoupledPair = {
    files: [
        "apps/vscode-plugin/src/BpmnLintConfigService.ts",
        "libs/core/src/LintConfigService.ts",
    ],
    sharedChanges: 5,
    revisions: [12, 14],
    degreePercent: 38,
    coupling: { kind: "hidden", group: "across-workspaces" },
    compositionRoots: [],
};

describe("the change coupling findings", () => {
    it("name both paths, the counts and the degree, keyed by the pair alone", () => {
        expect(changeCouplingFindings([PAIR])).toEqual([
            {
                key: "apps/vscode-plugin/src/BpmnLintConfigService.ts ↔ libs/core/src/LintConfigService.ts",
                path: "apps/vscode-plugin/src/BpmnLintConfigService.ts",
                line: 1,
                group: "across-workspaces",
                message:
                    "changes with `libs/core/src/LintConfigService.ts` in 5 PRs (12 and 14 revisions), degree 38 %",
            },
        ]);
    });

    it("name the shared import that explains a pair", () => {
        const [explained] = changeCouplingFindings([
            {
                ...PAIR,
                coupling: {
                    kind: "explained",
                    by: "libs/core/src/port/hostPorts.ts",
                    coChanges: 4,
                },
            },
        ]);

        expect(explained).toMatchObject({
            group: "explained",
            message: expect.stringMatching(
                /degree 38 %; explained by `libs\/core\/src\/port\/hostPorts\.ts` \(4 of 5\)$/,
            ),
        });
    });

    it("mark the composition roots of a pair", () => {
        const [marked] = changeCouplingFindings([
            { ...PAIR, compositionRoots: ["apps/vscode-plugin/src/BpmnLintConfigService.ts"] },
        ]);

        expect(marked.message).toMatch(
            /; composition root: `apps\/vscode-plugin\/src\/BpmnLintConfigService\.ts`$/,
        );
    });

    it("leave linked pairs out", () => {
        expect(changeCouplingFindings([{ ...PAIR, coupling: { kind: "linked" } }])).toEqual([]);
    });

    it("declare every group a finding names, hidden ones first and explained folded", () => {
        expect(CHANGE_COUPLING_GROUPS.map(({ id, collapsed }) => [id, collapsed === true])).toEqual(
            [
                ["kotlin-only", false],
                ["across-languages", false],
                ["across-workspaces", false],
                ["within-workspace", false],
                ["explained", true],
            ],
        );
    });
});
