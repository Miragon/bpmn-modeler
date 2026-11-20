import type { EvidenceList } from "../../fitness/domain/fitnessFunction";

export const HOTSPOTS_EVIDENCE = [
    {
        kind: "published",
        reference: "Tornhill, Your Code as a Crime Scene, 2015, 2nd edition 2024: hotspots",
    },
    {
        kind: "published",
        reference:
            "Tornhill, maat-scripts (https://github.com/adamtornhill/maat-scripts): merge_comp_freqs.py sorts by revisions; crime-scene-hotspots.html draws circle area = code lines, fill opacity = revisions ÷ max revisions",
    },
    {
        kind: "trial",
        commit: "e8c92425",
        outcome:
            "924 commits, 825 files: the top 20 holds 5 of the 8 libs/modeler-core services over 300 lines that issue 2057 names (10th to 18th; version 1 ranked the barrel libs/modeler-core/src/index.ts 9th and them 11th to 19th); ranking by revisions alone holds none of them and puts three barrels, a vitest.config.ts and a 60-line main.ts in its top 20; first is libs/shared/src/lib/modeler.ts, a type-only protocol file",
    },
    {
        kind: "trial",
        commit: "eb4fe899",
        outcome:
            "The 428 stored snapshots with version 1 findings, 0966e35f (2026-09-30) to eb4fe899 (2026-11-06): version 1 recomputed on each tree matched its stored top 20. Version 2 drops libs/modeler-core/src/index.ts, the only barrel in any top 20 (15 to 23 barrels per tree), from 197 of them, where it ranked 8th to 20th; every file below it moves up one place, and the next file enters 20th: DeploymentService.ts 59 times, ArtifactService.ts 38, BpmnLintConfigService.ts 32, AppendMenuOverlay.tsx 24, six others 44. Nothing else changes",
    },
    {
        kind: "trial",
        commit: "fe75e584",
        outcome:
            "version 3, rows new/resolved before → after. Each PR head (pull/<n>/head) against its baseRefOid: PR 2047 at 3d1b19b3 against 452b6440 1/1 → 0/0 (TemplateBuilder.tsx entered at 5 branch commits × 1,284 code lines = 6,420; as one revision it stays out); PRs 2170 to 2188 0/0 → 0/0, 2190 1/1 → 0/0; over 28 PRs 12/12 → 4/4. GitHub's test merge of the 6 trial PRs whose comment showed hotspot rows (2251, 2296, 2302, 2304, 2326, 2361): 6/6 → 4/4; PRs 2302 and 2326 lose packages/dmn-modeler/src/modeler.ts, which they did not touch; in the 4 left a file the PR touched enters and pushes the 20th out. The 28 merge-base trees and 28 stored snapshots (every 20th of 558, 8c726cbd to fe75e584) keep their findings",
    },
] as const satisfies EvidenceList;
