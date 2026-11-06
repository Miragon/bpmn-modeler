import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import {
    CONTRACT_HELPER_MODULE,
    CONTRACT_SUITE_GROUPS,
    contractSuiteFindings,
    coreScopeOf,
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
        version: 1,
        categories: { scope: "atomic", cadence: "triggered", result: "static" },
        measures:
            "Pairs of a core port and an adapter whose specs run no contract suite of that port. A port is an interface declared in a port/ folder of the hexagonal workspace that holds @miragon/bpmn-modeler-core/testing, resolved through the tsconfig.base.json paths: the core. An adapter is a named class outside specs, declaration files and test folders (__fixtures__, __tests__, test, tests) of any hexagonal workspace whose implements clause reaches the port, also through an interface that extends it: host adapters and the in-memory kit alike. A contract helper is a function that module exports with a parameter that produces the port: a factory returning the port, or returning an object one of whose properties holds it, awaited. A spec covers a pair when it imports the adapter class as a value and calls a helper of the port; the label argument is free. A port whose members all return void or Promise<void> is render-only, and a port with one adapter has nothing to drift from yet: the pairs of both are set aside in collapsed groups, not listed as missing a suite, unless the port has a suite; a second adapter moves a port's pairs up. Everything is resolved by the TypeScript type checker over the tracked sources of every hexagonal workspace with the tsconfig.base.json compiler options; no file or type name is read. One finding per pair without a suite, keyed by the adapter's and the port's path and name, not the line, and ranked by the port's number of adapters.",
        reliesOn: {
            skill: "architecture",
            rule: "a port the core reads back from has a contract suite in the core's testing kit once a second class implements it, and every adapter of the port runs it, the in-memory fake included",
        },
        misses: [
            "How thorough a suite is: it proves that a spec wires a suite to a class, not that the suite asserts the rules the core relies on.",
            "A class that satisfies a port without an implements clause of its own: an object literal typed by the port, a subclass of an adapter, an anonymous class.",
            "Ports outside the core's port/ folders (the bridge's HostSettingsMirror and WorkspaceRoots, the VS Code host's ModelerPreferences, the ports of tools/repo-checks), whose adapters no kit helper can cover, and adapters in a workspace that declares no hexagonal architecture.",
            "The Kotlin half of the bridge's Rpc adapters, which a TypeScript suite reaches only through a loopback.",
            "A port the core writes to and reads back through another port, such as LintingPreferencePort, whose value comes back through SettingsPort.getLintingEnabled, and a void method whose callback the host calls with a value: both count as render-only.",
            "A spec that reaches the adapter through a namespace import, a dynamic import or a fixture module.",
            "A spec that imports two adapters of a port and runs the suite against one of them: coverage is decided per spec, not per call, so it clears both pairs.",
            "A helper whose fixture holds several ports counts as a suite of each of them, though it may exercise only one.",
            "A fake written inside a spec, which is no adapter: it can disagree with a port's only adapter, whose pair is set aside.",
        ],
        reportsWrongly: [
            "Strategies the core chooses between rather than host adapters: CamundaEnginePort's C7 client, C8 client and router, and RepositorySource's GitHub, GitLab and local sources.",
            "A pair whose spec runs shared scenarios through a helper the type derivation does not recognise: VsCodeSettings and BridgeSettings run the shared settings normalization cases through readSettingsSnapshot(settings: SettingsPort), which takes the port instead of producing it.",
            "NotifierPort, which is not render-only by type only because withProgress<T> hands back the task's own Promise<T>.",
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
                    "first run: 23 ports in the core's port/ folders, 55 adapters, 1 helper (describeWorkspaceContract), 59 pairs. 2 run the suite (InMemoryWorkspace, NodeWorkspace); VsCodeWorkspace skips it; 42 pairs of 15 ports have no suite; 3 pairs of EngineInspectionPort, HttpClient and LintRunnerPort have one adapter each; 11 pairs of StatusBarPort, DiagnosticsPort, LoggerPort and LintingPreferencePort are render-only. Reading the port/ folders of every hexagonal workspace instead would add 18 pairs no kit helper can cover: 12 without a suite (11 tools/repo-checks adapters and RpcEditorHandle as the bridge's HostEditorHandle) and 6 render-only. 1.5 to 1.7 s per tree with node_modules, 1.1 to 1.7 s on a checkout without",
            },
            {
                kind: "trial",
                commit: "12ff0d9d",
                outcome:
                    "before the core moved into role folders it declares no interface in a port/ folder, so the function is unmeasurable there, and at bb6ae7ae, before the workspaces declared their kinds, the kit's workspace declares no hexagonal architecture; at ad3bc359, after the hosts moved too, it lists the same 57 finding keys as at cd48f2cd",
            },
        ],
        groups: CONTRACT_SUITE_GROUPS,
        findFindings: ({ repoRoot }) => {
            const core = coreScopeOf(sources.readLayout(repoRoot));
            if (core.kind === "unmeasurable") {
                throw new InsufficientHistory(core.reason);
            }
            const inventory = sources.read(repoRoot, core.scope);
            if (inventory.ports.length === 0) {
                throw new InsufficientHistory(
                    `the workspace of ${CONTRACT_HELPER_MODULE} declares no interface in a port/ folder`,
                );
            }
            return contractSuiteFindings(inventory);
        },
    });
}
