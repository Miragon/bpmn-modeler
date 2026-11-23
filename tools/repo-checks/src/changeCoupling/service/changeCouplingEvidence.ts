import type { EvidenceList } from "../../fitness/domain/fitnessFunction";

export const CHANGE_COUPLING_EVIDENCE = [
    {
        kind: "published",
        reference:
            "Gall, Hajek, Jazayeri, Detection of Logical Coupling Based on Product Release History, ICSM 1998",
    },
    {
        kind: "published",
        reference:
            "Zimmermann, Weißgerber, Diehl, Zeller, Mining Version Histories to Guide Software Changes, ICSE 2004 / IEEE TSE 2005",
    },
    {
        kind: "published",
        reference:
            "Moonen, Di Alesio, Binkley, Rolfsnes, Practical Guidelines for Change Recommendation using Association Rule Mining, ASE 2016",
    },
    {
        kind: "published",
        reference:
            "D'Ambros, Lanza, Robbes, On the Relationship Between Change Coupling and Software Defects, WCRE 2009",
    },
    {
        kind: "published",
        reference:
            "Tornhill, code-maat (https://github.com/adamtornhill/code-maat), default thresholds min-revs 5, min-shared-revs 5, min-coupling 30 %, max-changeset-size 30",
    },
    {
        kind: "trial",
        commit: "c53e97f0",
        outcome:
            "924 first-parent commits, code-maat thresholds, imports resolved by symbol: 127 coupled pairs, 63 linked, 36 explained, 28 hidden; BpmnLintConfigService.ts ↔ LintConfigService.ts listed, the only one of 9 known copies",
    },
    {
        kind: "trial",
        commit: "773f8014",
        outcome:
            "71 hidden pairs before the explained, barrel and config filters; each co-changes at least 3.8 times as often as two independent files would (lift), hypergeometric p below 0.001",
    },
    {
        kind: "trial",
        commit: "7d0ba862",
        outcome:
            "recount with this function: 129 coupled pairs, 64 linked, 32 explained, 33 hidden; the lint-config copy listed, no port and adapter linked through hostPorts.ts hidden; 6 shared changes or a degree of 35 % lose the copy, counting changeset size over all files loses it too",
    },
    {
        kind: "trial",
        commit: "fe75e584",
        outcome:
            "version 2, rows new/resolved before → after. Each PR head (pull/<n>/head) against its baseRefOid: PR 2047 at 3d1b19b3 against 452b6440 (38 commits, 3 merges) 10/15 → 0/0; PRs 2170 2/3 → 0/0, 2172 3/2 → 0/0, 2173 2/3 → 0/0, 2174 2/3 → 0/0, 2177 2/3 → 0/0, 2178 0/1 → 0/1, 2179 0/0 → 0/0, 2180 3/2 → 3/2, 2181 0/5 → 0/0, 2184 1/6 → 0/0, 2188 1/2 → 0/0, 2190 2/6 → 0/0; over 28 PRs 46/79 → 3/8, of them on files the branch did not touch 92 → 1. GitHub's test merge of 27 PRs: 10/8 → 3/8, on untouched files 8 → 1; PRs 2255, 2256 and 2257 lose BridgeScriptEditor.ts ↔ apps/vscode-plugin/src/main.ts, PRs 2332 and 2333 ModelerSettingsConfigurable.kt ↔ apps/vscode-plugin/package.json. The one row left: PR 2180 deletes and re-adds a bootstrap.ts, so a past commit falls from 31 to 30 read files and counts. Dropping the oldest base commit, for a window of 924, brings back 7 new rows on untouched files in 6 PRs. The 28 merge-base trees and 28 stored snapshots (every 20th of 558, 8c726cbd to fe75e584) keep their findings",
    },
    {
        kind: "trial",
        commit: "c001a82f",
        outcome:
            "version 3 against version 2: 50 to 53 findings. Reading every .json file under src/ instead of *.schema.json and *.cases.json adds the bridge's protocol.json and the two theme files of libs/standalone-extension. 6 pairs come in, all across-languages with protocol.json: descriptor.ts (17 PRs, 87 %) and types.ts (15, 71 %), the snapshot's sources; CoreProcess.kt (9, 56 %), HostUiRouter.kt (5, 37 %) and EditorSessionRouter.kt (5, 30 %), the RPC protocol's Kotlin half, which no spec pins (issue 2223); and the composition root editorSessionFeature.ts (5, 32 %). The themes add none. 3 pairs leave: ModelerSettingsConfigurable.kt and ModelerSettingsStore.kt ↔ VsCodeSettings.ts (53 % and 63 %) and CoreProcess.kt ↔ RpcResults.kt (48 %), each at 5 shared changes; PR 2172 (75786e96) also changes protocol.json, now crosses the 30-file limit and takes one shared change from each. Declaring the 13 overlay files linguist-generated instead of skipping every folder named languages skips the same files; without the declaration the tree has 130 findings. 0.61 to 0.65 s per tree warm, version 2 0.56 to 0.57 s in the same runs (one git check-attr over the tracked files)",
    },
    {
        kind: "trial",
        commit: "bb4be688",
        outcome:
            "version 4 against version 3, rows new/resolved before → after, each PR head against the base its fitness comment named (the comment versions of trial 2398), default branch origin/main. PR 2518: 3 heads against stack base 3b78524b and d4e7de9f against 793f7929 (meeting main at 7c4647b7) 2/0 → 0/0 each, losing MergeDecisionService.ts ↔ diffPaneRouter.ts and diffPaneRouter.ts ↔ mergePaneMessages.ts (in 5 PRs on the stack); PR 2382: 73c0da1e against 6b2d1406 1/0 → 0/0 (chromeTexts.ts ↔ viewState.ts), 5052a2b1 against 8c083749 0/0 → 0/0; PR 2527: 5 heads against its stack bases 1/0 → 0/0 (mergePaneView.ts ↔ mergePaneMessages.ts); PRs 2521, 2528 and 2530, 13 stacked heads, 0/0 → 0/0. Over the 24 stacked heads 14/0 → 0/0. The 8 runs against main (d4e7de9f against 7c4647b7 and each PR's last version) keep their rows: PR 2528's 2 versions there keep mergePaneView.ts ↔ mergePaneMessages.ts new (in 5 PRs). Its 5 stacked versions listed that pair as existing (in 6 PRs) under version 3 and no longer list it, the declared miss: the 5 squashes on main that change both files, PRs 2484, 2485, 2518, 2525 and 2527, are one change on that stack, on its last version, which meets main at 84afb2b3, PRs 2525 and 2527. The unsquashed commits had pushed older main commits out of the window: VsCodeStatusBar.ts ↔ BpmnLintConfigService.ts and NodeBpmnLinter.ts ↔ BpmnLintConfigService.ts come back on 22 of the 24 stacked heads, the known copy BpmnLintConfigService.ts ↔ LintConfigService.ts on PR 2382 at 73c0da1e",
    },
] as const satisfies EvidenceList;
