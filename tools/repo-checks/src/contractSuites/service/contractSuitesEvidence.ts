import type { EvidenceList } from "../../fitness/domain/fitnessFunction";

export const CONTRACT_SUITES_EVIDENCE = [
    {
        kind: "published",
        reference:
            "Liskov, Wing, A Behavioral Notion of Subtyping, ACM TOPLAS 16(6), 1994: every implementation keeps the specification of the type it implements, which one suite run against every implementation checks",
    },
    {
        kind: "trial",
        commit: "cd48f2cd",
        outcome:
            "first run: 23 ports in the core's port/ folders, 55 adapters, 1 helper (describeWorkspaceContract), 59 pairs. 2 run the suite (InMemoryWorkspace, NodeWorkspace); VsCodeWorkspace skips it; 42 pairs of 15 ports have no suite; 3 pairs of EngineInspectionPort, HttpClient and LintRunnerPort have one adapter each; 11 pairs of StatusBarPort, DiagnosticsPort, LoggerPort and LintingPreferencePort are render-only. Reading the port/ folders of every hexagonal workspace instead would add 18 pairs no kit helper can cover, all set aside: 12 with one adapter each (11 tools/repo-checks adapters and RpcEditorHandle as the bridge's HostEditorHandle) and 6 render-only. The read takes 1.3 to 1.8 s on a working tree with node_modules and 0.9 to 1.9 s on a checkout without (six runs each)",
    },
    {
        kind: "trial",
        commit: "12ff0d9d",
        outcome:
            "before the core moved into role folders it declares no interface in a port/ folder, so the function is unmeasurable there, and at bb6ae7ae, before the workspaces declared their kinds, the kit's workspace declares no hexagonal architecture; at ad3bc359, after the hosts moved too, it lists the same 57 finding keys as at cd48f2cd",
    },
    {
        kind: "trial",
        commit: "fe75e584",
        outcome:
            "version 2 against version 1 on main and at the heads of #2289 (21d26488), #2296 (82e13116) and #2341 (f99fe331). main: 88 to 93 adapters, 17 to 25 findings, none lost. PluginInventory and RulePackageInventory meet CodeAddOnSource, whose pairs are listed without a suite (2); the inventories' own ports PluginAddOnSource, RulePackageAddOnSource, TemplateAddOnSource and MarketplaceAddOnSource, and BridgeSettings as SettingChanges, are set aside with one adapter (5); vsCodeModelerPreferences meets LanguagePreferencePort through the VS Code ModelerPreferences interface (1 render-only pair), so the RpcLanguagePreference row reads 1 of 2 adapters. #2289: 15 to 20 findings, the CodeAddOnSource pairs among them, where the review found two prune callers disagreeing by hand; #2296: 15 to 22, adding TemplateAddOnSource and MarketplaceAddOnSource; #2341: 17 to 25, LanguagePreferencePort with two adapters. Counting every object literal would list 30 on main: the 4 core literals as adapters that skip their port's suite, and the kit's request value as the only adapter of ApprovalReviewRequest, an interface of data. Counting no implementer inside the core, as #2355 asked to trial, would drop 17 of the 25, the 6 strategy pairs and both CodeAddOnSource pairs among them. The read takes 2.2 to 3.8 s per tree instead of 1.5 to 2.2 s, while other runs loaded the machine. Keeping only the union parts a value meets, adding compound assignments and constructors, and dropping literals named inside a function change no adapter or finding on any of the four trees",
    },
] as const satisfies EvidenceList;
