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
    {
        kind: "trial",
        commit: "d55b8732",
        outcome:
            "The 738 stored snapshots with version 3 findings, d7e71c3d to d55b8732, each tree read from git's objects: version 3 recomputed matched every stored top 20. Version 4 changes all 738: 1 file leaves in 469, 2 in 122, 3 in 7 and 8 to 13 in 140. Leaving, each a type-only file or a table: the bridge's protocol types.ts 682 times (5th to 20th; 436 at apps/modeler-bridge/src/protocol/domain/, 246 at its earlier path protocol/), libs/modeler-core's hostPorts.ts 174 (13th to 20th; 169 at shared/domain/, 5 at kernel/domain/), each of the 12 translation overlays of libs/bpmn-i18n-extras 115 to 147 (3rd to 20th) and packages/bpmn-modeler/src/publicApi.ts 11. Entering, 26 files: BpmnLintConfigService.ts 273, TemplateMarketplaceService.ts 193, DeploymentFeature.ts 162, marketplace.ts 156, DiffViewer.ts 156, 21 others 1 to 150; the only one without a function is sourceOnlyKeys.ts (9, a new Set). At d55b8732 the 12 overlays (3rd to 14th) and the bridge's types.ts (16th) leave, and BpmnEditorFeature.ts, TemplateMarketplaceService.ts, DeploymentTargetService.ts, mergePaneMessages.ts, mergeTexts.ts, BpmnLintConfigService.ts, protocolMessageMap.ts, designer.ts, DeploymentFeature.ts, marketplace.ts, mergeMode.ts, CodeLinkMapService.ts and descriptor.ts enter 8th to 20th. On the squash commits of PRs 2422, 2431 and 2462 the bridge's types.ts (5th) leaves and one file enters 20th; on 2347 and 2485 publicApi.ts leaves too, on 2347 es.ts as well; on 2489 and 2521 it leaves with 7 and 8 overlays. libs/shared/src/lib/modeler.ts stays 1st to 3rd in all 738: its message classes run code",
    },
    {
        kind: "trial",
        commit: "bb4be688",
        outcome:
            "version 5 against version 4, the comment versions of trial 2398 on PRs 2382, 2518, 2521, 2527, 2528 and 2530, each head against the base its comment named, default branch origin/main: rows new/resolved 0/0 → 0/0 on all 24 stacked heads, as HEAD and the base sit on the same stack, and unchanged on the 8 runs against main. The ranking moves to main's: BpmnLintConfigService.ts has 18 to 20 revisions (12th or 13th) on the 22 stacked heads of PRs 2518 to 2530 and 26 or 27 (7th or 8th) after, as in each of their last versions against main (27, 7th); PR 2521 at 1629b6af against c5c068cd 19 → 27; on PR 2382's 2 stacked heads 25 → 26 and 25 → 25. Files in a stacked head's top 20 that are not in its PR's last version against main: 1 or 2 → 0 or 1. descriptor.ts stays 20th (30 revisions) on the 13 heads whose stack meets main at f3492e34 (PR 2518's 3 against 3b78524b, the first 2 of PRs 2521 and 2530, the first 3 of PRs 2527 and 2528), where protocolMessageMap.ts, 15th or 16th against main, falls out: that stack holds PRs 2484, 2485 and 2488 (on PR 2530 also 2529) as one change, the declared miss, and PR 2347, merged after the fork, is outside its window. BridgeScriptEditor.ts is 18th and 19th on PR 2382's 2 stacked heads, as PR 2422, merged after that stack forked, shortened it from 582 to 482 lines",
    },
] as const satisfies EvidenceList;
