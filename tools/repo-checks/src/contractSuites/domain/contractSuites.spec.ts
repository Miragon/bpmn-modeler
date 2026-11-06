import { describe, expect, it } from "vitest";

import {
    type Adapter,
    type AdapterSpec,
    CONTRACT_SUITE_GROUPS,
    type ContractHelper,
    type ContractSuiteInventory,
    contractSuiteFindings,
    type CoreScope,
    coreScopeOf,
    type Declared,
    isAdapterSource,
    isPortSource,
    isProductionSource,
    isSpecSource,
    type Port,
} from "./contractSuites";

const KIT = "libs/modeler-core/src/testing/index.ts";
const SCOPE: CoreScope = {
    helperModule: KIT,
    coreSourceRoot: "libs/modeler-core/src/",
    hexagonalSourceRoots: ["apps/modeler-bridge/src/", "libs/modeler-core/src/"],
};
const PORTS = "libs/modeler-core/src/kernel/port/hostPorts.ts";

function port(name: string, ...members: [string, boolean][]): Port {
    return {
        path: PORTS,
        name,
        members: members.map(([member, returnsNothing]) => ({ name: member, returnsNothing })),
    };
}

function adapter(path: string, name: string, ...ports: Port[]): Adapter {
    return { path, name, line: 7, ports: ports.map(declared) };
}

function declared({ path, name }: Declared): Declared {
    return { path, name };
}

function helper(name: string, ...ports: Port[]): ContractHelper {
    return { path: "libs/modeler-core/src/testing/contract.ts", name, ports: ports.map(declared) };
}

function spec(path: string, adapters: Adapter[], helpers: ContractHelper[]): AdapterSpec {
    return { path, adapters: adapters.map(declared), helpers: helpers.map(declared) };
}

const WORKSPACE = port("WorkspacePort", ["readFile", false], ["writeFile", true]);
const STATUS = port("StatusBarPort", ["show", true], ["hide", true]);
const IN_MEMORY = adapter(
    "libs/modeler-core/src/testing/InMemoryWorkspace.ts",
    "InMemoryWorkspace",
    WORKSPACE,
);
const NODE = adapter(
    "apps/modeler-bridge/src/kernel/adapter/out/NodeWorkspace.ts",
    "NodeWorkspace",
    WORKSPACE,
);
const VS_CODE = adapter(
    "apps/vscode-plugin/src/shared/adapter/out/VsCodeWorkspace.ts",
    "VsCodeWorkspace",
    WORKSPACE,
);
const DESCRIBE = helper("describeWorkspaceContract", WORKSPACE);

function inventory(overrides: Partial<ContractSuiteInventory>): ContractSuiteInventory {
    return {
        ports: [WORKSPACE],
        adapters: [IN_MEMORY, NODE, VS_CODE],
        helpers: [DESCRIBE],
        specs: [
            spec(
                "libs/modeler-core/src/testing/InMemoryWorkspace.contract.spec.ts",
                [IN_MEMORY],
                [DESCRIBE],
            ),
            spec(
                "apps/modeler-bridge/src/kernel/adapter/out/NodeWorkspace.contract.spec.ts",
                [NODE],
                [DESCRIBE],
            ),
        ],
        ...overrides,
    };
}

function pairsOf(overrides: Partial<ContractSuiteInventory>): string[] {
    return contractSuiteFindings(inventory(overrides)).map(
        ({ group, message }) => `${group}: ${message.split(":")[0]}`,
    );
}

describe("contractSuiteFindings", () => {
    it("lists an adapter of a port with a suite that its specs do not run, keyed without the line", () => {
        expect(contractSuiteFindings(inventory({}))).toEqual([
            {
                key: "apps/vscode-plugin/src/shared/adapter/out/VsCodeWorkspace.ts#VsCodeWorkspace → libs/modeler-core/src/kernel/port/hostPorts.ts#WorkspacePort",
                path: "apps/vscode-plugin/src/shared/adapter/out/VsCodeWorkspace.ts",
                line: 7,
                message:
                    "`VsCodeWorkspace`: runs no `WorkspacePort` suite (`describeWorkspaceContract`); `NodeWorkspace` and `InMemoryWorkspace` do",
                group: "skips-suite",
                rank: 1,
            },
        ]);
    });

    it.each([
        {
            case: "imports the adapter and calls no helper",
            spec: spec("x.spec.ts", [VS_CODE], []),
            listed: true,
        },
        {
            case: "calls the helper and imports another adapter",
            spec: spec("x.spec.ts", [NODE], [DESCRIBE]),
            listed: true,
        },
        {
            case: "imports the adapter and calls a helper of another port",
            spec: spec("x.spec.ts", [VS_CODE], [helper("describeStatus", STATUS)]),
            listed: true,
        },
        {
            case: "imports the adapter and calls a helper of its port",
            spec: spec("x.spec.ts", [VS_CODE], [helper("runWorkspaceScenarios", WORKSPACE)]),
            listed: false,
        },
    ])("a spec that $case leaves the adapter listed: $listed", ({ spec: candidate, listed }) => {
        const specs = [...inventory({}).specs, candidate];
        const helpers = [DESCRIBE, helper("runWorkspaceScenarios", WORKSPACE)];

        expect(pairsOf({ specs, helpers })).toEqual(
            listed ? ["skips-suite: `VsCodeWorkspace`"] : [],
        );
    });

    it.each([
        {
            case: "a port whose members all return nothing is render-only",
            ports: [STATUS],
            helpers: [],
            adapterCount: 1,
            group: "render-only",
        },
        {
            case: "a port that declares no member is render-only",
            ports: [port("StatusBarPort")],
            helpers: [],
            adapterCount: 1,
            group: "render-only",
        },
        {
            case: "a port the core reads back from without a helper has no suite",
            ports: [port("StatusBarPort", ["show", true], ["current", false])],
            helpers: [],
            adapterCount: 2,
            group: "no-suite",
        },
        {
            case: "a port the core reads back from with one adapter and no helper is set aside",
            ports: [port("StatusBarPort", ["show", true], ["current", false])],
            helpers: [],
            adapterCount: 1,
            group: "one-adapter",
        },
        {
            case: "a port with a helper its only adapter does not run is skipped",
            ports: [port("StatusBarPort", ["current", false])],
            helpers: [helper("describeStatus", STATUS)],
            adapterCount: 1,
            group: "skips-suite",
        },
        {
            case: "a render-only port with a helper no adapter runs is skipped",
            ports: [STATUS],
            helpers: [helper("describeStatus", STATUS)],
            adapterCount: 2,
            group: "skips-suite",
        },
    ])("$case", ({ ports, helpers, adapterCount, group }) => {
        const statusBars = ["apps/x", "apps/y"]
            .slice(0, adapterCount)
            .map((dir) => adapter(`${dir}/src/adapter/out/StatusBar.ts`, "StatusBar", STATUS));

        expect(
            contractSuiteFindings({ ports, adapters: statusBars, helpers, specs: [] }).map(
                (finding) => finding.group,
            ),
        ).toEqual(statusBars.map(() => group));
    });

    it("lists nothing for a port no class implements", () => {
        expect(pairsOf({ ports: [WORKSPACE, STATUS] })).toEqual(["skips-suite: `VsCodeWorkspace`"]);
    });

    it("ranks the ports by their number of adapters, then by path and name", () => {
        const picker = port("PickerPort", ["choose", false]);
        const clipboard = port("ClipboardPort", ["readClipboard", false]);
        const findings = contractSuiteFindings({
            ports: [picker, WORKSPACE, clipboard, STATUS],
            adapters: [
                adapter("a/Clipboard.ts", "Clipboard", clipboard),
                adapter("a/Picker.ts", "Picker", picker),
                adapter("b/Picker.ts", "Picker", picker),
                adapter("a/Status.ts", "Status", STATUS),
                IN_MEMORY,
                NODE,
                VS_CODE,
            ],
            helpers: [],
            specs: [],
        });

        expect(findings.map(({ rank, path }) => `${rank} ${path}`)).toEqual([
            "3 a/Clipboard.ts",
            "2 a/Picker.ts",
            "4 a/Status.ts",
            "1 apps/modeler-bridge/src/kernel/adapter/out/NodeWorkspace.ts",
            "1 apps/vscode-plugin/src/shared/adapter/out/VsCodeWorkspace.ts",
            "2 b/Picker.ts",
            "1 libs/modeler-core/src/testing/InMemoryWorkspace.ts",
        ]);
    });

    it.each([
        {
            case: "more than three read-back members",
            port: port(
                "PickerPort",
                ["choose", false],
                ["chooseMany", false],
                ["confirm", false],
                ["searchAndChoose", false],
                ["dispose", true],
            ),
            adapterPaths: ["a/P.ts"],
            message:
                "`P`: `PickerPort` has no suite (its only adapter); the core reads back `choose`, `chooseMany`, `confirm` and 1 more",
        },
        {
            case: "three read-back members",
            port: port("PickerPort", ["choose", false], ["chooseMany", false], ["confirm", false]),
            adapterPaths: ["a/P.ts"],
            message:
                "`P`: `PickerPort` has no suite (its only adapter); the core reads back `choose`, `chooseMany` and `confirm`",
        },
        {
            case: "a render-only port with two adapters",
            port: port("PickerPort", ["show", true], ["hide", true]),
            adapterPaths: ["a/P.ts", "b/P.ts"],
            message:
                "`P`: `PickerPort` only renders (1 of 2 adapters); every member returns nothing: `show` and `hide`",
        },
        {
            case: "a member-less port",
            port: port("PickerPort"),
            adapterPaths: ["a/P.ts"],
            message: "`P`: `PickerPort` only renders (its only adapter); it declares no member",
        },
    ])("words a finding for $case", ({ port: picker, adapterPaths, message }) => {
        const [first] = contractSuiteFindings({
            ports: [picker],
            adapters: adapterPaths.map((path) => adapter(path, "P", picker)),
            helpers: [],
            specs: [],
        });

        expect(first.message).toBe(message);
    });

    it("words a skipped suite that no adapter runs", () => {
        expect(
            contractSuiteFindings(inventory({ specs: [], adapters: [VS_CODE] })).map(
                ({ message }) => message,
            ),
        ).toEqual([
            "`VsCodeWorkspace`: runs no `WorkspacePort` suite (`describeWorkspaceContract`); no adapter does",
        ]);
    });

    it("declares the groups in report order, one-adapter and render-only collapsed", () => {
        expect(
            CONTRACT_SUITE_GROUPS.map(({ id, collapsed }) => `${id} ${collapsed === true}`),
        ).toEqual(["skips-suite false", "no-suite false", "one-adapter true", "render-only true"]);
    });
});

describe("coreScopeOf", () => {
    it("takes the hexagonal workspace that holds the kit as the core", () => {
        expect(
            coreScopeOf({
                helperModule: KIT,
                hexagonalWorkspaceDirs: ["apps/modeler-bridge", "libs/modeler-core"],
            }),
        ).toEqual({ kind: "measurable", scope: SCOPE });
    });

    it.each([
        {
            case: "no path resolves the kit",
            helperModule: undefined,
            reason: "no tsconfig.base.json path resolves @miragon/bpmn-modeler-core/testing",
        },
        {
            case: "the kit lies in no hexagonal workspace",
            helperModule: KIT,
            reason: "the workspace of @miragon/bpmn-modeler-core/testing declares no hexagonal architecture",
        },
        {
            case: "only a sibling directory's name starts like a hexagonal workspace",
            helperModule: "libs/modeler-core-next/src/testing/index.ts",
            reason: "the workspace of @miragon/bpmn-modeler-core/testing declares no hexagonal architecture",
        },
    ])("is unmeasurable when $case", ({ helperModule, reason }) => {
        expect(
            coreScopeOf({
                helperModule,
                hexagonalWorkspaceDirs: helperModule === KIT ? [] : ["libs/modeler-core"],
            }),
        ).toEqual({ kind: "unmeasurable", reason });
    });
});

describe("the source kinds", () => {
    it.each([
        ["libs/modeler-core/src/kernel/port/hostPorts.ts", true],
        ["libs/modeler-core/src/scriptTask/port/nested/ScriptEditorPort.ts", true],
        ["libs/modeler-core/src/kernel/domain/port.ts", false],
        ["libs/modeler-core/src/testing/port/FakePort.ts", false],
        ["libs/modeler-core/src/kernel/port/hostPorts.spec.ts", false],
        ["libs/modeler-core/src/kernel/port/__fixtures__/ports.ts", false],
        ["apps/modeler-bridge/src/kernel/port/WorkspaceRoots.ts", false],
    ])("a port may be declared in %s: %s", (path, accepted) => {
        expect(isPortSource(path, SCOPE)).toBe(accepted);
    });

    it.each([
        ["apps/modeler-bridge/src/kernel/adapter/out/NodeWorkspace.ts", true],
        ["libs/modeler-core/src/testing/InMemoryWorkspace.ts", true],
        ["apps/modeler-bridge/test/NodeWorkspace.ts", false],
        ["apps/flat/src/FlatWorkspace.ts", false],
        ["apps/modeler-bridge/src/kernel/adapter/out/NodeWorkspace.spec.ts", false],
    ])("an adapter may be declared in %s: %s", (path, accepted) => {
        expect(isAdapterSource(path, SCOPE)).toBe(accepted);
    });

    it.each([
        ["apps/vscode-plugin/src/shared/adapter/out/VsCodeWorkspace.ts", true, false],
        ["apps/vscode-plugin/src/ui/View.tsx", true, false],
        ["apps/vscode-plugin/src/shared/adapter/out/VsCodeWorkspace.spec.ts", false, true],
        ["apps/vscode-plugin/src/ui/View.test.tsx", false, true],
        ["apps/vscode-plugin/src/__fixtures__/vscodeStorage.ts", false, false],
        ["apps/vscode-plugin/src/types/vscode.d.ts", false, false],
    ])("%s holds adapters: %s, is a spec: %s", (path, production, specFile) => {
        expect([isProductionSource(path), isSpecSource(path)]).toEqual([production, specFile]);
    });
});
