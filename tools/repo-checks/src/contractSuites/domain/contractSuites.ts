import { roleOf } from "@miragon/architecture-testing";

import { compareText, type Finding, sortFindings } from "../../fitness/domain/finding";
import type { FindingGroup } from "../../fitness/domain/fitnessFunction";
import {
    DECLARATION_FILE,
    SPEC_FILE,
    TEST_FOLDERS,
    TYPESCRIPT_FILE,
} from "../../sourceFiles/domain/sourceFiles";

/** The core's test kit: a contract helper is a function it exports. */
export const CONTRACT_HELPER_MODULE = "@miragon/bpmn-modeler-core/testing";

export const CONTRACT_SUITE_GROUPS: readonly [FindingGroup, ...FindingGroup[]] = [
    { id: "skips-suite", title: "Adapters that skip their port's suite" },
    { id: "no-suite", title: "Ports the core reads back from, without a suite" },
    {
        id: "one-adapter",
        title: "Ports the core reads back from with one adapter, without a suite",
        collapsed: true,
    },
    {
        id: "render-only",
        title: "Render-only ports: every member returns void or Promise<void>",
        collapsed: true,
    },
];

/** A declaration by its file and name; the name is shown, never matched against a pattern. */
export interface Declared {
    readonly path: string;
    readonly name: string;
}

interface PortMember {
    readonly name: string;
    /** Every signature returns `void` or a promise of it, so the core reads nothing back. */
    readonly returnsNothing: boolean;
}

export interface Port extends Declared {
    readonly members: readonly PortMember[];
}

export interface Adapter extends Declared {
    readonly line: number;
    readonly ports: readonly Declared[];
}

export interface ContractHelper extends Declared {
    readonly ports: readonly Declared[];
}

/** A spec, with the adapters it imports as values and the helpers it calls. */
export interface AdapterSpec {
    readonly path: string;
    readonly adapters: readonly Declared[];
    readonly helpers: readonly Declared[];
}

export interface ContractSuiteInventory {
    readonly ports: readonly Port[];
    readonly adapters: readonly Adapter[];
    readonly helpers: readonly ContractHelper[];
    readonly specs: readonly AdapterSpec[];
}

export interface KitLayout {
    /** The kit's file, through the `tsconfig.base.json` paths. */
    readonly helperModule: string | undefined;
    readonly hexagonalWorkspaceDirs: readonly string[];
}

/** Source roots end in a slash. The core is the hexagonal workspace that holds the kit. */
export interface CoreScope {
    readonly helperModule: string;
    readonly coreSourceRoot: string;
    readonly hexagonalSourceRoots: readonly string[];
}

export type CoreScopeOutcome =
    | { readonly kind: "measurable"; readonly scope: CoreScope }
    | { readonly kind: "unmeasurable"; readonly reason: string };

type ContractSuiteGroup = "skips-suite" | "no-suite" | "one-adapter" | "render-only";

const LISTED_MEMBERS = 3;

export function isSpecSource(path: string): boolean {
    return SPEC_FILE.test(path);
}

export function isProductionSource(path: string): boolean {
    return (
        !isSpecSource(path) &&
        !DECLARATION_FILE.test(path) &&
        !path
            .split("/")
            .slice(0, -1)
            .some((folder) => TEST_FOLDERS.has(folder))
    );
}

function inHexagonalWorkspace(path: string, { hexagonalSourceRoots }: CoreScope): boolean {
    return hexagonalSourceRoots.some((sourceRoot) => path.startsWith(sourceRoot));
}

/** Specs included, so their imports and calls resolve. */
export function isProgramSource(path: string, scope: CoreScope): boolean {
    return (
        TYPESCRIPT_FILE.test(path) &&
        !DECLARATION_FILE.test(path) &&
        inHexagonalWorkspace(path, scope)
    );
}

export function coreScopeOf({ helperModule, hexagonalWorkspaceDirs }: KitLayout): CoreScopeOutcome {
    if (helperModule === undefined) {
        return {
            kind: "unmeasurable",
            reason: `no tsconfig.base.json path resolves ${CONTRACT_HELPER_MODULE}`,
        };
    }
    const coreDir = hexagonalWorkspaceDirs.find((dir) => helperModule.startsWith(`${dir}/`));
    if (coreDir === undefined) {
        return {
            kind: "unmeasurable",
            reason: `the workspace of ${CONTRACT_HELPER_MODULE} declares no hexagonal architecture`,
        };
    }
    return {
        kind: "measurable",
        scope: {
            helperModule,
            coreSourceRoot: `${coreDir}/src/`,
            hexagonalSourceRoots: hexagonalWorkspaceDirs.map((dir) => `${dir}/src/`),
        },
    };
}

/** A core without ports would read as clean, so it is unmeasurable instead. */
export function unmeasurableReasonOf({ ports }: ContractSuiteInventory): string | undefined {
    return ports.length === 0
        ? `the workspace of ${CONTRACT_HELPER_MODULE} declares no interface in a port/ folder`
        : undefined;
}

/** Below the core's source root the first role folder decides. */
export function isPortSource(path: string, { coreSourceRoot }: CoreScope): boolean {
    return (
        path.startsWith(coreSourceRoot) &&
        isProductionSource(path) &&
        roleOf(path.slice(coreSourceRoot.length))?.role === "port"
    );
}

export function isAdapterSource(path: string, scope: CoreScope): boolean {
    return inHexagonalWorkspace(path, scope) && isProductionSource(path);
}

function idOf({ path, name }: Declared): string {
    return `${path}#${name}`;
}

function sameDeclaration(left: Declared): (right: Declared) => boolean {
    return (right) => idOf(right) === idOf(left);
}

function isRenderOnly({ members }: Port): boolean {
    return members.every(({ returnsNothing }) => returnsNothing);
}

function code(name: string): string {
    return `\`${name}\``;
}

function listed(names: readonly string[]): string {
    const shown = names.slice(0, LISTED_MEMBERS).map(code);
    if (names.length > LISTED_MEMBERS) {
        return `${shown.join(", ")} and ${names.length - LISTED_MEMBERS} more`;
    }
    return shown.length > 1
        ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`
        : shown.join("");
}

function adapterShare(adapterCount: number): string {
    return adapterCount === 1 ? "its only adapter" : `1 of ${adapterCount} adapters`;
}

interface PortSuites {
    readonly port: Port;
    readonly adapters: readonly Adapter[];
    readonly helpers: readonly ContractHelper[];
    readonly covered: readonly Adapter[];
}

// A suite someone wrote binds every adapter, even of a port that only renders.
function groupOf({ port, adapters, helpers }: PortSuites): ContractSuiteGroup {
    if (helpers.length > 0) {
        return "skips-suite";
    }
    if (isRenderOnly(port)) {
        return "render-only";
    }
    return adapters.length === 1 ? "one-adapter" : "no-suite";
}

function messageOf(suites: PortSuites, adapter: Adapter, group: ContractSuiteGroup): string {
    const { port, adapters, helpers, covered } = suites;
    const share = adapterShare(adapters.length);
    if (group === "skips-suite") {
        const runners =
            covered.length === 0
                ? "no adapter does"
                : `${listed(covered.map(({ name }) => name))} ${covered.length === 1 ? "does" : "do"}`;
        return `${code(adapter.name)}: runs no ${code(port.name)} suite (${helpers.map(({ name }) => code(name)).join(", ")}); ${runners}`;
    }
    if (group === "no-suite" || group === "one-adapter") {
        const readBack = port.members.filter(({ returnsNothing }) => !returnsNothing);
        return `${code(adapter.name)}: ${code(port.name)} has no suite (${share}); the core reads back ${listed(readBack.map(({ name }) => name))}`;
    }
    const members =
        port.members.length === 0
            ? "it declares no member"
            : `every member returns nothing: ${listed(port.members.map(({ name }) => name))}`;
    return `${code(adapter.name)}: ${code(port.name)} only renders (${share}); ${members}`;
}

function compareDeclarations(left: Declared, right: Declared): number {
    return compareText(left.path, right.path) || compareText(left.name, right.name);
}

function suitesOf(port: Port, inventory: ContractSuiteInventory): PortSuites {
    const isPort = sameDeclaration(port);
    const adapters = inventory.adapters
        .filter(({ ports }) => ports.some(isPort))
        .sort(compareDeclarations);
    const helpers = inventory.helpers.filter(({ ports }) => ports.some(isPort));
    const runsSuite = (adapter: Adapter): boolean =>
        inventory.specs.some(
            (spec) =>
                spec.adapters.some(sameDeclaration(adapter)) &&
                spec.helpers.some((called) => helpers.some(sameDeclaration(called))),
        );
    return { port, adapters, helpers, covered: adapters.filter(runsSuite) };
}

// More adapters first: they are the ones that can drift apart.
function compareRisk(left: PortSuites, right: PortSuites): number {
    return (
        right.adapters.length - left.adapters.length || compareDeclarations(left.port, right.port)
    );
}

export function contractSuiteFindings(inventory: ContractSuiteInventory): Finding[] {
    const ranked = inventory.ports
        .map((port) => suitesOf(port, inventory))
        .filter(({ adapters }) => adapters.length > 0)
        .sort(compareRisk);
    return sortFindings(
        ranked.flatMap((suites, index) => {
            const group = groupOf(suites);
            return suites.adapters
                .filter((adapter) => !suites.covered.includes(adapter))
                .map((adapter): Finding => ({
                    key: `${idOf(adapter)} → ${idOf(suites.port)}`,
                    path: adapter.path,
                    paths: [adapter.path, suites.port.path],
                    line: adapter.line,
                    message: messageOf(suites, adapter, group),
                    group,
                    rank: index + 1,
                }));
        }),
    );
}
