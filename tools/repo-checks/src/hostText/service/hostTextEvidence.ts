import type { EvidenceList } from "../../fitness/domain/fitnessFunction";

export const HOST_TEXT_EVIDENCE = [
    {
        kind: "trial",
        commit: "3d1b19b3",
        outcome:
            "PR 2047: ElementTemplateEditorController.ts sat in controller/, outside the infrastructure/VsCode*.ts name scope, which matched 27 files; the report lists its 7 texts, among them `${…} already exists in ${…}.`, the folder-pick placeholder `Workspace folder for the new element template` and `New Element Template`. 127 host files, 55 TypeScript and 72 Kotlin; 205 findings in 45 files",
    },
    {
        kind: "trial",
        commit: "cd48f2cd",
        outcome:
            "956 files read, 89 of them Kotlin. 137 host files: 48 import vscode, 17 only implement a core interface, 72 Kotlin files import com.intellij. 197 findings in 43 files. TypeScript: 52 in 12 files, 35 texts the VS Code host builds (18 in TemplateMarketplaceController.ts; 5 in CommandController.ts that version 1 skipped inside logAndRethrow(…), among them `Select the modeler language`, which IntelliJ words `Select the modeler UI language`). Kotlin: 145 in 31 files: 25 texts the IntelliJ host builds (8 in AddMarketplaceAction.kt, 7 in RemoveMarketplaceAction.kt, among them `No marketplaces registered.`, which TemplateMarketplaceController.ts words as well), 33 on the settings page, 13 host chrome, 24 messages about the host's own failure and 50 technical strings. Not read: 35 two-word Kotlin texts in log calls, 1 in a thrown constructor. Requiring a letter or digit on both sides of the whitespace drops 9 findings, all punctuation such as `:root {`. 0.46 to 0.70 s per tree, version 1 0.40 to 0.68 s in the same runs",
    },
    {
        kind: "trial",
        commit: "fe75e584",
        outcome:
            "Version 3 against version 2, the same counts at 862b8a02: 156 to 112 findings, 44 dropped, none added. Markup, 41: 33 in WebviewServer.kt (its three page shells written line by line: doctype, html, meta, link, body, div and script tags, two document titles, one style element), 7 in WebviewHtml.ts, DeploymentWebviewHtml.ts and AddOnsViewHtml.ts (6 page shells of structure, a title and a script each, and WebviewHtml.ts's DMN properties panel markup, a fragment of tags) and RpcChannel.kt's log redaction marker `<redacted: credential-bearing frame>`. Kotlin preconditions, 3: the require(…) invariants of TemplatePreferences.kt (2) and PluginApprovalStore.kt (1). No dropped row is a text a user sees; the 6 literals that start with a tag and hold text stay: the JCEF-unavailable labels of BpmnDiffViewer.kt and ModelerToolWindowFactory.kt, the out-of-process notice of ModelerBrowsers.kt (2) and comments on the settings page (2). Rejected: a literal that starts with `<!DOCTYPE` drops 9 and leaves 30 lines of the Kotlin shells; a literal that starts with a tag drops 47, those 6 user texts among them; tags without the title, style and script content drop 33 and leave 5 TypeScript shells, whose titles hold two words. The trial of issue 2238 at each PR's final head against its merge base: 18 new rows (the trial's 17 and PR 2359's moved `Failed to open compare view: ${…}`) become 7. Gone: the 6 shell rows (PRs 2309, 2325 twice, 2326, 2359 twice), the 3 require(…) rows (PRs 2279, 2307 twice) and 2 of PR 2310's 8, moved shell lines. 0.48 to 0.49 s per tree, version 2 0.48 to 0.57 s in the same runs",
    },
    {
        kind: "trial",
        commit: "c001a82f",
        outcome:
            "Version 4 against version 3: 112 findings both, the same keys. Kotlin loggers come from their declarations instead of the names log, LOG, logger, thisLogger and console: 17 host files declare one from Logger.getInstance(…), all named log, and 41 two-word texts in 16 of them stay unread; no host file calls thisLogger(), logger<T>() or fileLogger(). TypeScript keeps log… for the core's LoggerPort (7 texts in 5 files) and new Error (9 texts), both guarded; dropping console, which took no text, and log, LOG and logger adds no finding, as the one text on this.logger goes to logWarning(…). Rejected: deciding log calls and Error subclasses by type. A type program over apps/vscode-plugin and apps/modeler-bridge, resolving the 257 calls that hold a literal, took 1.5 to 2.1 s on a working tree with node_modules (two runs) and would change no finding. 0.20 to 0.41 s per tree warm, version 3 0.17 to 0.19 s in the same runs",
    },
    {
        kind: "trial",
        commit: "69ecc374",
        outcome:
            "Version 5 against version 4: 111 findings both, the same keys. Test folders are skipped as the size and contract functions skip them, so 12 helpers of the VS Code smoke tests and the Orca e2e tests are no longer read; none imports vscode or implements a core interface. A spec narrows from any name holding .spec. or .test. to one ending in .spec or .test and a .js or .ts extension, as everywhere else; a name such as a.spec.data.ts is read now, and no tracked file has one.",
    },
] as const satisfies EvidenceList;
