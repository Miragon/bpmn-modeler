import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import {
    CONTRACT_SUITE_GROUPS,
    contractSuiteFindings,
    coreScopeOf,
    unmeasurableReasonOf,
} from "../domain/contractSuites";
import type { ContractSuiteSources } from "../port/ContractSuiteSources";

export interface ContractSuitesPorts {
    readonly sources: ContractSuiteSources;
}

export function createContractSuitesFitnessFunction({
    sources,
}: ContractSuitesPorts): FitnessFunction {
    return defineFitnessFunction({
        id: "contract-suites",
        version: 2,
        categories: { scope: "atomic", cadence: "triggered", result: "static" },
        measures:
            "Pairs of a core port and an adapter whose specs run no contract suite of that port. A port is an interface declared in a port/ folder of the hexagonal workspace that holds @miragon/bpmn-modeler-core/testing, resolved through the tsconfig.base.json paths: the core. An adapter is a named class outside specs, declaration files and test folders (__fixtures__, __tests__, test, tests) of any hexagonal workspace that reaches the port: by its implements clause, also through an interface that extends it or an intersection that holds it, or because a production file of those workspaces hands it over where the port is expected (an argument, an assignment, also a compound one, a return value, an initializer, a property, an array element or a branch of a conditional; of a union only the parts the value meets, and for a class passed as its constructor what the constructor returns), also as an interface such a file hands over as the port. Outside the core's workspace, a module-scope variable or function that names an object literal handed over that way is an adapter too. Host adapters, the in-memory kit and implementers inside the core count alike. A contract helper is a function that module exports with a parameter that produces the port: a factory returning the port, or returning an object one of whose properties holds it, awaited; a type parameter stands for its constraint and a union or an intersection for each of its parts. A spec covers a pair when it imports the adapter as a value and calls a helper of the port; the label argument is free. A port none of whose members is a function holds data and lists no pair. A port whose members all return void or Promise<void> is render-only, and a port with one adapter has nothing to drift from yet: the pairs of both are set aside in collapsed groups, not listed as missing a suite, unless the port has a suite; a second adapter moves a port's pairs up. Everything is resolved by the TypeScript type checker over the tracked sources of every hexagonal workspace with the tsconfig.base.json compiler options; no file or type name is read. One finding per pair without a suite, keyed by the adapter's and the port's path and name, not the line, and ranked by the port's number of adapters.",
        reliesOn: {
            skill: "architecture",
            rule: "a port the core reads back from has a contract suite in the core's testing kit once a second adapter meets it, by an implements clause or handed over as the port, and every adapter of the port runs it, the in-memory fake included",
        },
        misses: [
            "How thorough a suite is: it proves that a spec wires a suite to a class, not that the suite asserts the rules the core relies on.",
            "An implementation no production file hands over as the port: a class passed only as its own type or to a type parameter bounded by the port, which the checker infers as the class; a subclass handed over only through its parent; an anonymous class; an object literal no module-scope variable or function names, passed inline, returned by a method or named only inside a function body.",
            "An object literal in the core's own workspace. In the trial each was a default for a host without the feature or a kit stub that drops the port's behaviour by design (TRUSTED_WORKSPACE, PANEL_ALWAYS_VISIBLE, fingerprintHasher, NO_GIT_FILES), so a kit fake written as a literal is missed with them.",
            "Ports outside the core's port/ folders (the bridge's HostSettingsMirror and WorkspaceRoots, the VS Code host's ModelerPreferences, the ports of tools/repo-checks), whose adapters no kit helper can cover, and adapters in a workspace that declares no hexagonal architecture.",
            "Whether a bridge loopback answers as the Kotlin host does: a TypeScript suite reaches the Kotlin side only through the loopback. Where the loopback's spec and a Kotlin test run one case file, the rows hold both; the function does not read which rules have such a file.",
            "A port without a suite that the core writes to and reads back through another port, such as LanguagePreferencePort, whose value comes back through SettingsPort.getLanguage, and a void method whose callback the host calls with a value: both count as render-only.",
            "A spec that reaches the adapter through a namespace import, a dynamic import or a fixture module.",
            "A spec that imports two adapters of a port and runs the suite against one of them: coverage is decided per spec, not per call, so it clears both pairs.",
            "A helper whose fixture holds several ports counts as a suite of each of them, though it may exercise only one.",
            "A fake written inside a spec, which is no adapter: it can disagree with a port's only adapter, whose pair is set aside. What a spec hands over makes no adapter either.",
        ],
        reportsWrongly: [
            "Strategies the core chooses between rather than host adapters: CamundaEnginePort's C7 client, C8 client and router, and RepositorySource's GitHub, GitLab and local sources.",
            "A pair whose spec runs shared scenarios through a helper the type derivation does not recognise, such as a kit function that takes the port instead of producing it, as readSettingsSnapshot(settings: SettingsPort) does.",
        ],
        evidence: [
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
        ],
        groups: CONTRACT_SUITE_GROUPS,
        findFindings: ({ repoRoot }) => {
            const core = coreScopeOf(sources.readLayout(repoRoot));
            if (core.kind === "unmeasurable") {
                throw new InsufficientHistory(core.reason);
            }
            const inventory = sources.read(repoRoot, core.scope);
            const unmeasurable = unmeasurableReasonOf(inventory);
            if (unmeasurable !== undefined) {
                throw new InsufficientHistory(unmeasurable);
            }
            return contractSuiteFindings(inventory);
        },
    });
}
