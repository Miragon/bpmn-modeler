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
] as const satisfies EvidenceList;
