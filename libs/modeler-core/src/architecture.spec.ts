import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Architecture gate for `@miragon/bpmn-modeler-core`. The engine stays
 * host-agnostic: no file imports `vscode` or reaches a Node host module
 * (`node:*`, `fs`, `http`). Pure Node utilities that exist in any Node host
 * (`path`, `Buffer`) are allowed; they are not host capabilities.
 *
 * Inside the core, layers point inward, features meet only in `kernel/` and
 * `editorSession/`, and `kernel/` imports nothing outside itself. Each exception
 * below names the issue that removes it, and an exception the code no longer
 * needs fails the gate, so the lists only shrink.
 */
const SRC_ROOT = __dirname;

type Layer = "domain" | "service" | "session" | "infrastructure" | "root";

interface ModuleRef {
    readonly path: string;
    readonly feature: string;
    readonly layer: Layer;
}

interface ImportEdge {
    readonly from: ModuleRef;
    readonly specifier: string;
    /** Set when the specifier resolves to a classified source file. */
    readonly to?: ModuleRef;
}

/** `from` and `to` name a file, a folder or a feature; `*` matches any module. */
interface KnownException {
    readonly from: string;
    readonly to: string;
    readonly until: string;
}

const LAYER_FOLDERS: readonly Layer[] = ["domain", "service", "session", "infrastructure"];
const APPLICATION_LAYERS: readonly Layer[] = ["service", "session"];
const DOMAIN_PACKAGES: readonly string[] = ["@miragon/bpmn-modeler-types", "path"];
const KERNEL_FEATURE = "kernel";
const SUBSTRATE: readonly string[] = [KERNEL_FEATURE, "editorSession"];
const INBOUND_ADAPTER = /MessageHandlers\.ts$/;

const DOMAIN_PACKAGE_EXCEPTIONS: readonly KnownException[] = [
    {
        from: "editorSession/domain/EditorSession.ts",
        to: "@miragon/bpmn-modeler-shared",
        until: "#1828 splits EditorHandle out of the editor-session events",
    },
    {
        from: "scriptTask/domain/ScriptVariableStore.ts",
        to: "@miragon/bpmn-modeler-shared",
        until: "#1834 moves processVariables into modeler-types",
    },
];

/** Source files under `src/`, as root-relative POSIX-ish paths, specs excluded. */
function listSourceFiles(): string[] {
    const out: string[] = [];
    const walk = (absDir: string): void => {
        for (const entry of readdirSync(absDir)) {
            const abs = join(absDir, entry);
            if (statSync(abs).isDirectory()) {
                walk(abs);
            } else if (
                /\.tsx?$/.test(entry) &&
                !entry.endsWith(".d.ts") &&
                !/\.(spec|test)\.tsx?$/.test(entry)
            ) {
                out.push(
                    normalize(abs.slice(SRC_ROOT.length + 1))
                        .split("\\")
                        .join("/"),
                );
            }
        }
    };
    walk(SRC_ROOT);
    return out;
}

function readImports(files: readonly string[]): Map<string, string[]> {
    return new Map(
        files.map((file) => [file, importSpecifiers(readFileSync(join(SRC_ROOT, file), "utf8"))]),
    );
}

/** Walks the syntax tree, which leaves comments (JSDoc included) and strings out. */
function importSpecifiers(source: string): string[] {
    const specifiers: string[] = [];
    const visit = (node: ts.Node): void => {
        const specifier = moduleSpecifierOf(node);
        if (specifier !== undefined) {
            specifiers.push(specifier);
        }
        ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest));
    return specifiers;
}

function moduleSpecifierOf(node: ts.Node): string | undefined {
    let literal: ts.Node | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        literal = node.moduleSpecifier;
    } else if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
    ) {
        literal = node.moduleReference.expression;
    } else if (ts.isCallExpression(node) && isImportOrRequire(node.expression)) {
        literal = node.arguments[0];
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
        literal = node.argument.literal;
    }
    return literal !== undefined && ts.isStringLiteralLike(literal) ? literal.text : undefined;
}

function isImportOrRequire(callee: ts.Expression): boolean {
    return (
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(callee) && callee.text === "require")
    );
}

/** `vscode` and the Node platform — what the host-agnostic core must not name. */
function isHostModule(specifier: string): boolean {
    return (
        specifier === "vscode" ||
        specifier.startsWith("node:") ||
        specifier === "fs" ||
        specifier.startsWith("fs/") ||
        specifier === "http" ||
        specifier === "https"
    );
}

/** Resolves a relative import specifier from `fromFile` to a known source path. */
function resolveRelative(
    fromFile: string,
    specifier: string,
    known: ReadonlySet<string>,
): string | undefined {
    const base = normalize(join(dirname(fromFile), specifier))
        .split("\\")
        .join("/");
    for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
        if (known.has(candidate)) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Files that transitively reach a host module: seeded with every file whose own
 * source imports one, then propagated backwards along relative-import edges.
 */
function hostReachingFiles(importsByFile: ReadonlyMap<string, readonly string[]>): Set<string> {
    const known = new Set(importsByFile.keys());
    const importers = new Map<string, string[]>();
    const tainted = new Set<string>();
    for (const [file, specifiers] of importsByFile) {
        if (specifiers.some(isHostModule)) {
            tainted.add(file);
        }
        for (const specifier of specifiers) {
            if (!specifier.startsWith(".")) {
                continue;
            }
            const target = resolveRelative(file, specifier, known);
            if (target) {
                (importers.get(target) ?? importers.set(target, []).get(target)!).push(file);
            }
        }
    }
    const queue = [...tainted];
    while (queue.length > 0) {
        for (const importer of importers.get(queue.pop()!) ?? []) {
            if (!tainted.has(importer)) {
                tainted.add(importer);
                queue.push(importer);
            }
        }
    }
    return tainted;
}

/** The feature is the first folder, or `modeler/<editor>`; the folder below it is the layer. */
function classify(path: string): ModuleRef | "exempt" {
    if (path === "index.ts" || path.startsWith("testing/") || path.startsWith("types/")) {
        return "exempt";
    }
    const segments = path.split("/");
    const featureDepth = segments[0] === "modeler" ? 2 : 1;
    const feature = segments.slice(0, featureDepth).join("/");
    const inFeature = segments.slice(featureDepth);
    if (inFeature.length === 1) {
        return { path, feature, layer: "root" };
    }
    const layer = LAYER_FOLDERS.find((folder) => folder === inFeature[0]);
    if (layer === undefined) {
        throw new Error(`${path} is neither a feature root file nor inside a layer folder`);
    }
    return { path, feature, layer };
}

function readEdges(importsByFile: ReadonlyMap<string, readonly string[]>): ImportEdge[] {
    const known = new Set(importsByFile.keys());
    return [...importsByFile].flatMap(([file, specifiers]) => {
        const from = classify(file);
        if (from === "exempt") {
            return [];
        }
        return specifiers.map((specifier): ImportEdge => {
            const target = specifier.startsWith(".")
                ? resolveRelative(file, specifier, known)
                : undefined;
            const to = target === undefined ? undefined : classify(target);
            return to === undefined || to === "exempt"
                ? { from, specifier }
                : { from, specifier, to };
        });
    });
}

function domainPackageViolations(edges: readonly ImportEdge[]): ImportEdge[] {
    return edges.filter(
        ({ from, specifier, to }) =>
            from.layer === "domain" && to === undefined && !DOMAIN_PACKAGES.includes(specifier),
    );
}

function domainLayerViolations(edges: readonly ImportEdge[]): ImportEdge[] {
    return edges.filter(
        ({ from, to }) => from.layer === "domain" && to !== undefined && to.layer !== "domain",
    );
}

function crossFeatureViolations(edges: readonly ImportEdge[]): ImportEdge[] {
    return edges.filter(
        ({ from, to }) =>
            to !== undefined && to.feature !== from.feature && !SUBSTRATE.includes(to.feature),
    );
}

function kernelImportViolations(edges: readonly ImportEdge[]): ImportEdge[] {
    return edges.filter(
        ({ from, to }) =>
            from.feature === KERNEL_FEATURE && to !== undefined && to.feature !== KERNEL_FEATURE,
    );
}

function serviceToInfrastructureViolations(edges: readonly ImportEdge[]): ImportEdge[] {
    return edges.filter(
        ({ from, to }) => APPLICATION_LAYERS.includes(from.layer) && to?.layer === "infrastructure",
    );
}

function adapterToServiceViolations(edges: readonly ImportEdge[]): ImportEdge[] {
    return edges.filter(
        ({ from, to }) =>
            from.layer === "infrastructure" &&
            to?.layer === "service" &&
            !INBOUND_ADAPTER.test(from.path),
    );
}

/** No other rule sees such an edge, so it could hide a cycle or a cross-feature import. */
function unresolvedImportViolations(edges: readonly ImportEdge[]): ImportEdge[] {
    return edges.filter(({ specifier, to }) => specifier.startsWith(".") && to === undefined);
}

/** One sorted entry per strongly connected component, however many imports close it. */
function importCycles(edges: readonly ImportEdge[]): string[][] {
    const successors = new Map<string, string[]>();
    for (const { from, to } of edges) {
        if (to !== undefined) {
            successors.set(from.path, [...(successors.get(from.path) ?? []), to.path]);
        }
    }
    const reachableFrom = new Map(
        [...successors.keys()].map((file) => [file, reachable(file, successors)]),
    );
    const grouped = new Set<string>();
    const cycles: string[][] = [];
    for (const file of [...reachableFrom.keys()].sort()) {
        if (grouped.has(file) || !reachableFrom.get(file)!.has(file)) {
            continue;
        }
        const cycle = [...reachableFrom.get(file)!]
            .filter((other) => reachableFrom.get(other)?.has(file))
            .sort();
        cycle.forEach((member) => grouped.add(member));
        cycles.push(cycle);
    }
    return cycles;
}

function reachable(start: string, successors: ReadonlyMap<string, readonly string[]>): Set<string> {
    const seen = new Set<string>();
    const queue = [...(successors.get(start) ?? [])];
    while (queue.length > 0) {
        const file = queue.pop()!;
        if (!seen.has(file)) {
            seen.add(file);
            queue.push(...(successors.get(file) ?? []));
        }
    }
    return seen;
}

function inScope(scope: string, path: string): boolean {
    return scope === "*" || path === scope || path.startsWith(`${scope}/`);
}

function excuses(exception: KnownException, { from, specifier, to }: ImportEdge): boolean {
    return inScope(exception.from, from.path) && inScope(exception.to, to?.path ?? specifier);
}

function unexcused(
    violations: readonly ImportEdge[],
    exceptions: readonly KnownException[],
): ImportEdge[] {
    return violations.filter(
        (violation) => !exceptions.some((exception) => excuses(exception, violation)),
    );
}

function staleExceptions(
    violations: readonly ImportEdge[],
    exceptions: readonly KnownException[],
): KnownException[] {
    return exceptions.filter(
        (exception) => !violations.some((violation) => excuses(exception, violation)),
    );
}

function describeEdge({ from, specifier, to }: ImportEdge): string {
    return `${from.path} -> ${to?.path ?? specifier}`;
}

const LAYER_RULES = [
    {
        rule: "domain imports no package but @miragon/bpmn-modeler-types and path",
        violations: domainPackageViolations,
        exceptions: DOMAIN_PACKAGE_EXCEPTIONS,
    },
    {
        rule: "domain imports no service, session, infrastructure or feature-root module",
        violations: domainLayerViolations,
        exceptions: [],
    },
    {
        rule: "a feature reaches another feature only through kernel/ or editorSession/",
        violations: crossFeatureViolations,
        exceptions: [],
    },
    {
        rule: "kernel/ imports nothing outside kernel/",
        violations: kernelImportViolations,
        exceptions: [],
    },
    {
        rule: "services and session participants import no infrastructure",
        violations: serviceToInfrastructureViolations,
        exceptions: [],
    },
    {
        rule: "only inbound *MessageHandlers adapters in infrastructure import services",
        violations: adapterToServiceViolations,
        exceptions: [],
    },
    {
        rule: "a relative import resolves to a feature module, not to index.ts, testing/ or nothing",
        violations: unresolvedImportViolations,
        exceptions: [],
    },
] as const;

function moduleAt(feature: string, layer: Layer, file: string): ModuleRef {
    return {
        path: layer === "root" ? `${feature}/${file}` : `${feature}/${layer}/${file}`,
        feature,
        layer,
    };
}

function edge(from: ModuleRef, to: ModuleRef | string): ImportEdge {
    return typeof to === "string"
        ? { from, specifier: to }
        : { from, specifier: `./${to.path}`, to };
}

const deploymentTarget = moduleAt("deployment", "domain", "deploymentTarget.ts");
const deploymentPorts = moduleAt("deployment", "domain", "ports.ts");
const deploymentService = moduleAt("deployment", "service", "DeploymentService.ts");
const deploymentParticipant = moduleAt("deployment", "session", "DeploymentStatusParticipant.ts");
const deploymentFeature = moduleAt("deployment", "root", "DeploymentFeature.ts");
const camundaClient = moduleAt("deployment", "infrastructure", "camunda/Camunda7RestClient.ts");
const deploymentHandlers = moduleAt("deployment", "infrastructure", "deploymentMessageHandlers.ts");
const sessionParticipantContract = moduleAt(
    "editorSession",
    "domain",
    "EditorSessionParticipant.ts",
);
const kernelErrors = moduleAt("kernel", "domain", "errors.ts");
const artifactService = moduleAt("kernel", "service", "ArtifactService.ts");
const marketplaceService = moduleAt(
    "template-marketplace",
    "service",
    "TemplateMarketplaceService.ts",
);
const gitHubSource = moduleAt("template-marketplace", "infrastructure", "GitHubSource.ts");
const kernelHttp = moduleAt("kernel", "domain", "http.ts");
const fetchHttpClient = moduleAt("kernel", "infrastructure", "FetchHttpClient.ts");

/** Every edge here is allowed by every rule. */
const LAYERED_GRAPH: readonly ImportEdge[] = [
    edge(deploymentTarget, deploymentPorts),
    edge(deploymentTarget, kernelErrors),
    edge(deploymentTarget, "@miragon/bpmn-modeler-types"),
    edge(deploymentTarget, "path"),
    edge(deploymentService, deploymentTarget),
    edge(deploymentService, artifactService),
    edge(deploymentParticipant, deploymentService),
    edge(deploymentParticipant, sessionParticipantContract),
    edge(deploymentFeature, deploymentService),
    edge(deploymentFeature, camundaClient),
    edge(deploymentHandlers, deploymentService),
    edge(camundaClient, deploymentPorts),
    edge(camundaClient, kernelHttp),
    edge(deploymentFeature, fetchHttpClient),
    edge(fetchHttpClient, kernelHttp),
    edge(marketplaceService, kernelErrors),
    edge(gitHubSource, kernelHttp),
    edge(gitHubSource, "bpmnlint"),
];

describe("import reading", () => {
    it.each([
        { form: "a static import", source: 'import { a } from "./a";' },
        { form: "a type-only import", source: 'import type { A } from "./a";' },
        { form: "a re-export", source: 'export { a } from "./a";' },
        { form: "a star re-export", source: 'export * from "./a";' },
        { form: "a namespace re-export", source: 'export * as a from "./a";' },
        { form: "a type namespace re-export", source: 'export type * as A from "./a";' },
        { form: "a deferred namespace import", source: 'import defer * as a from "./a";' },
        { form: "a side-effect import", source: 'import "./a";' },
        { form: "a dynamic import", source: 'const a = import("./a");' },
        { form: "a require call", source: 'const a = require("./a");' },
        { form: "an import-equals require", source: 'import a = require("./a");' },
        { form: "an import type", source: 'type A = import("./a").A;' },
    ])("reads $form", ({ source }) => {
        expect(importSpecifiers(source)).toEqual(["./a"]);
    });

    it.each([
        {
            form: "an import() inside a JSDoc link",
            source: '/** {@link import("../x").Y} */\nimport { a } from "./a";',
        },
        {
            form: "a commented-out import",
            source: '// import { x } from "./x";\nimport { a } from "./a";',
        },
        {
            form: "an import inside a string",
            source: 'const text = \'import { x } from "./x"\';\nimport { a } from "./a";',
        },
        {
            form: "a call to a function other than require",
            source: 'const label = translate("./x");\nimport { a } from "./a";',
        },
        {
            form: "a dynamic import of a computed path",
            source: 'const x = import(modulePath);\nimport { a } from "./a";',
        },
    ])("ignores $form", ({ source }) => {
        expect(importSpecifiers(source)).toEqual(["./a"]);
    });
});

describe("module classification", () => {
    it.each([
        { path: "deployment/domain/envRef.ts", feature: "deployment", layer: "domain" },
        {
            path: "deployment/infrastructure/camunda/Camunda7RestClient.ts",
            feature: "deployment",
            layer: "infrastructure",
        },
        { path: "kernel/service/ArtifactService.ts", feature: "kernel", layer: "service" },
        {
            path: "kernel/infrastructure/FetchHttpClient.ts",
            feature: "kernel",
            layer: "infrastructure",
        },
        {
            path: "modeler/bpmn/session/BpmnlintParticipant.ts",
            feature: "modeler/bpmn",
            layer: "session",
        },
        { path: "deployment/DeploymentFeature.ts", feature: "deployment", layer: "root" },
        {
            path: "template-marketplace/MarketplaceFeature.ts",
            feature: "template-marketplace",
            layer: "root",
        },
    ])("places $path in $feature/$layer", ({ path, feature, layer }) => {
        expect(classify(path)).toEqual({ path, feature, layer });
    });

    it.each(["index.ts", "testing/createTestHost.ts", "types/bpmnlint.d.ts"])(
        "exempts %s",
        (path) => {
            expect(classify(path)).toBe("exempt");
        },
    );

    it.each(["deployment/helpers/format.ts", "modeler/registry.ts"])(
        "rejects %s, which sits in no layer folder",
        (path) => {
            expect(() => classify(path)).toThrow(path);
        },
    );
});

describe("edge reading", () => {
    it("links relative imports to their module and keeps packages and exempt targets as specifiers", () => {
        const service = moduleAt("deployment", "service", "A.ts");
        const domain = moduleAt("deployment", "domain", "b.ts");
        const edges = readEdges(
            new Map([
                [service.path, ["../domain/b", "bpmnlint", "../../testing/fake", "../domain/b.js"]],
                [domain.path, []],
                ["deployment/service/bpmnlint.ts", []],
                ["testing/fake.ts", ["../deployment/service/A"]],
            ]),
        );

        expect(edges).toEqual([
            { from: service, specifier: "../domain/b", to: domain },
            { from: service, specifier: "bpmnlint" },
            { from: service, specifier: "../../testing/fake" },
            { from: service, specifier: "../domain/b.js" },
        ]);
    });
});

describe("host reach", () => {
    it.each(["vscode", "node:fs", "fs", "fs/promises", "http", "https"])(
        "treats %s as a host module",
        (specifier) => {
            expect(hostReachingFiles(new Map([["kernel/service/A.ts", [specifier]]]))).toEqual(
                new Set(["kernel/service/A.ts"]),
            );
        },
    );

    it.each(["path", "@miragon/bpmn-modeler-types"])(
        "does not treat %s as a host module",
        (specifier) => {
            expect(hostReachingFiles(new Map([["kernel/service/A.ts", [specifier]]]))).toEqual(
                new Set(),
            );
        },
    );

    it("marks every file that reaches a host module through relative imports", () => {
        const reaching = hostReachingFiles(
            new Map([
                ["kernel/infrastructure/FetchHttpClient.ts", ["node:http"]],
                ["deployment/DeploymentFeature.ts", ["../kernel/infrastructure/FetchHttpClient"]],
                ["index.ts", ["./deployment/DeploymentFeature"]],
                ["deployment/domain/envRef.ts", ["path"]],
            ]),
        );

        expect([...reaching].sort()).toEqual([
            "deployment/DeploymentFeature.ts",
            "index.ts",
            "kernel/infrastructure/FetchHttpClient.ts",
        ]);
    });
});

describe("rules on a synthetic graph", () => {
    it.each([
        {
            name: "domain → protocol package",
            violations: domainPackageViolations,
            offending: edge(deploymentTarget, "@miragon/bpmn-modeler-shared"),
        },
        {
            name: "domain → Node host module",
            violations: domainPackageViolations,
            offending: edge(deploymentTarget, "node:fs"),
        },
        {
            name: "domain → service",
            violations: domainLayerViolations,
            offending: edge(deploymentTarget, deploymentService),
        },
        {
            name: "domain → session",
            violations: domainLayerViolations,
            offending: edge(deploymentTarget, deploymentParticipant),
        },
        {
            name: "domain → infrastructure",
            violations: domainLayerViolations,
            offending: edge(deploymentTarget, camundaClient),
        },
        {
            name: "domain → feature root",
            violations: domainLayerViolations,
            offending: edge(deploymentTarget, deploymentFeature),
        },
        {
            name: "feature → another feature",
            violations: crossFeatureViolations,
            offending: edge(gitHubSource, deploymentPorts),
        },
        {
            name: "editorSession → a feature",
            violations: crossFeatureViolations,
            offending: edge(sessionParticipantContract, deploymentTarget),
        },
        {
            name: "kernel → a feature",
            violations: kernelImportViolations,
            offending: edge(fetchHttpClient, deploymentPorts),
        },
        {
            name: "kernel → editorSession",
            violations: kernelImportViolations,
            offending: edge(artifactService, sessionParticipantContract),
        },
        {
            name: "service → infrastructure",
            violations: serviceToInfrastructureViolations,
            offending: edge(deploymentService, camundaClient),
        },
        {
            name: "session → infrastructure",
            violations: serviceToInfrastructureViolations,
            offending: edge(deploymentParticipant, camundaClient),
        },
        {
            name: "non-handler infrastructure → service",
            violations: adapterToServiceViolations,
            offending: edge(camundaClient, deploymentService),
        },
        {
            name: "a relative import of the package entry",
            violations: unresolvedImportViolations,
            offending: edge(deploymentService, "../../index"),
        },
        {
            name: "a relative import of the test kit",
            violations: unresolvedImportViolations,
            offending: edge(deploymentService, "../../testing/createTestHost"),
        },
        {
            name: "a relative import that resolves to no source file",
            violations: unresolvedImportViolations,
            offending: edge(deploymentService, "../domain/ports.js"),
        },
    ])("flags $name and nothing else", ({ violations, offending }) => {
        expect(violations([...LAYERED_GRAPH, offending])).toEqual([offending]);
    });

    it.each([
        { name: "a layered graph", graph: LAYERED_GRAPH, cycles: [] },
        {
            name: "a two-file cycle",
            graph: [...LAYERED_GRAPH, edge(deploymentTarget, deploymentService)],
            cycles: [[deploymentTarget.path, deploymentService.path]],
        },
        {
            name: "a cycle reached through a file outside it",
            graph: [
                edge(deploymentFeature, deploymentService),
                edge(deploymentService, deploymentTarget),
                edge(deploymentTarget, deploymentService),
            ],
            cycles: [[deploymentTarget.path, deploymentService.path]],
        },
        {
            name: "a self-import",
            graph: [edge(kernelErrors, kernelErrors)],
            cycles: [[kernelErrors.path]],
        },
        {
            name: "a cycle whose import is written twice",
            graph: [
                edge(deploymentService, deploymentTarget),
                edge(deploymentTarget, deploymentService),
                edge(deploymentTarget, deploymentService),
            ],
            cycles: [[deploymentTarget.path, deploymentService.path]],
        },
        {
            name: "a tangle of three files closed by two imports",
            graph: [
                ...LAYERED_GRAPH,
                edge(deploymentTarget, deploymentService),
                edge(deploymentTarget, deploymentParticipant),
            ],
            cycles: [[deploymentTarget.path, deploymentService.path, deploymentParticipant.path]],
        },
        {
            name: "two separate cycles",
            graph: [
                edge(kernelErrors, kernelErrors),
                edge(deploymentService, deploymentTarget),
                edge(deploymentTarget, deploymentService),
            ],
            cycles: [[deploymentTarget.path, deploymentService.path], [kernelErrors.path]],
        },
    ])("finds the import cycles of $name", ({ graph, cycles }) => {
        expect(importCycles(graph)).toEqual(cycles);
    });
});

describe("known exceptions", () => {
    it.each([
        {
            name: "a file exception covers that file's import",
            exception: { from: deploymentTarget.path, to: "@miragon/bpmn-modeler-shared" },
            violation: edge(deploymentTarget, "@miragon/bpmn-modeler-shared"),
            covers: true,
        },
        {
            name: "a file exception does not cover a sibling file",
            exception: { from: deploymentTarget.path, to: "@miragon/bpmn-modeler-shared" },
            violation: edge(deploymentPorts, "@miragon/bpmn-modeler-shared"),
            covers: false,
        },
        {
            name: "a file exception does not cover another package",
            exception: { from: deploymentTarget.path, to: "@miragon/bpmn-modeler-shared" },
            violation: edge(deploymentTarget, "node:fs"),
            covers: false,
        },
        {
            name: "a feature exception covers every file of the pair",
            exception: { from: "template-marketplace", to: "deployment" },
            violation: edge(gitHubSource, deploymentPorts),
            covers: true,
        },
        {
            name: "a feature exception matches whole path segments only",
            exception: { from: "template", to: "deployment" },
            violation: edge(gitHubSource, deploymentPorts),
            covers: false,
        },
        {
            name: "a feature exception has a direction",
            exception: { from: "deployment", to: "template-marketplace" },
            violation: edge(gitHubSource, deploymentPorts),
            covers: false,
        },
        {
            name: "a wildcard importer covers any module importing the target",
            exception: { from: "*", to: camundaClient.path },
            violation: edge(deploymentService, camundaClient),
            covers: true,
        },
        {
            name: "a wildcard importer does not widen the target",
            exception: { from: "*", to: camundaClient.path },
            violation: edge(deploymentService, deploymentHandlers),
            covers: false,
        },
    ])("$name", ({ exception, violation, covers }) => {
        const known = { ...exception, until: "#0" };

        expect(unexcused([violation], [known])).toEqual(covers ? [] : [violation]);
        expect(staleExceptions([violation], [known])).toEqual(covers ? [] : [known]);
    });
});

describe("modeler-core architecture", () => {
    const importsByFile = readImports(listSourceFiles());
    const edges = readEdges(importsByFile);

    it("no engine file imports vscode", () => {
        const offenders = [...importsByFile]
            .filter(([, specifiers]) => specifiers.includes("vscode"))
            .map(([file]) => file);
        expect(
            offenders,
            `@miragon/bpmn-modeler-core must be vscode-free; these import it:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no engine file transitively reaches a host module", () => {
        const offenders = [...hostReachingFiles(importsByFile)];
        expect(
            offenders,
            `these transitively import a host module (vscode/node:*/fs/http) — ` +
                `the engine must reach the host only through ports:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it.each(LAYER_RULES)("$rule", ({ violations, exceptions }) => {
        expect(unexcused(violations(edges), exceptions).map(describeEdge)).toEqual([]);
    });

    it("has no import cycles", () => {
        expect(importCycles(edges).map((cycle) => cycle.join(", "))).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        const stale = LAYER_RULES.flatMap(({ violations, exceptions }) =>
            staleExceptions(violations(edges), exceptions),
        );
        expect(stale).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        const unnamed = LAYER_RULES.flatMap(({ exceptions }) => exceptions).filter(
            ({ until }) => !/#\d+/.test(until),
        );
        expect(unnamed).toEqual([]);
    });
});
