import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { preProcessFile } from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Architecture gate for `@miragon/bpmn-modeler-core`. The engine stays
 * host-agnostic: no file imports `vscode` or reaches a Node host module
 * (`node:*`, `fs`, `http`). Pure Node utilities that exist in any Node host
 * (`path`, `Buffer`) are allowed; they are not host capabilities.
 *
 * Inside the core, layers point inward and features meet only in `shared/`.
 * Each exception below names what removes it, and an exception the code no
 * longer needs fails the gate, so the lists only shrink.
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
const SHARED_FEATURE = "shared";
const INBOUND_ADAPTER = /MessageHandlers\.ts$/;

const DOMAIN_PACKAGE_EXCEPTIONS: readonly KnownException[] = [
    {
        from: "shared/domain/EditorSession.ts",
        to: "@miragon/bpmn-modeler-shared",
        until: "#1828 moves the editor session out of shared/",
    },
    {
        from: "shared/domain/hostPorts.ts",
        to: "@miragon/bpmn-modeler-shared",
        until: "#1828 reshapes DeploymentStatePort, the only user of AuthTypePayload",
    },
    {
        from: "scriptTask/domain/ScriptVariableStore.ts",
        to: "@miragon/bpmn-modeler-shared",
        until: "#1834 moves processVariables into modeler-types",
    },
];

const CROSS_FEATURE_EXCEPTIONS: readonly KnownException[] = [
    {
        from: "template-marketplace",
        to: "deployment",
        until: "#1828 moves HttpClient into the kernel",
    },
    {
        from: "shared",
        to: "deployment",
        until: "#1828 shapes the status-bar and deployment-state ports by intent",
    },
    {
        from: "shared",
        to: "migration",
        until: "#1828 replaces the migration-scope prompt with a generic picker",
    },
];

const SERVICE_INFRASTRUCTURE_EXCEPTIONS: readonly KnownException[] = [
    {
        from: "*",
        to: "shared/infrastructure/EditorSessionStore.ts",
        until: "#1828 moves the editor-session core into editorSession/",
    },
    {
        from: "*",
        to: "shared/infrastructure/EditorDocumentSync.ts",
        until: "#1828 moves the editor-session core into editorSession/",
    },
    {
        from: "*",
        to: "shared/infrastructure/WebviewMessageRouter.ts",
        until: "#1828 moves the editor-session core into editorSession/",
    },
    {
        from: "*",
        to: "shared/infrastructure/webviewLogHandlers.ts",
        until: "#1828 moves the editor-session core into editorSession/",
    },
    {
        from: "*",
        to: "template-marketplace/infrastructure/MarketplaceCache.ts",
        until: "no issue yet: the store becomes a port or a service",
    },
    {
        from: "*",
        to: "diff/infrastructure/DiffPaneStore.ts",
        until: "no issue yet: the store becomes a port or a service",
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

function importSpecifiers(source: string): string[] {
    return preProcessFile(source, true, true).importedFiles.map((file) => file.fileName);
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
            to !== undefined && to.feature !== from.feature && to.feature !== SHARED_FEATURE,
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

/** One cycle per back edge of a depth-first walk, so a single bad import can list several. */
function importCycles(edges: readonly ImportEdge[]): string[][] {
    const successors = new Map<string, string[]>();
    for (const { from, to } of edges) {
        if (to !== undefined) {
            successors.set(from.path, [...(successors.get(from.path) ?? []), to.path]);
        }
    }
    const finished = new Set<string>();
    const cycles: string[][] = [];
    const visit = (file: string, trail: readonly string[]): void => {
        const repeatsAt = trail.indexOf(file);
        if (repeatsAt >= 0) {
            cycles.push([...trail.slice(repeatsAt), file]);
            return;
        }
        if (finished.has(file)) {
            return;
        }
        for (const next of successors.get(file) ?? []) {
            visit(next, [...trail, file]);
        }
        finished.add(file);
    };
    for (const file of successors.keys()) {
        visit(file, []);
    }
    return cycles;
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
        rule: "a feature reaches another feature only through shared/",
        violations: crossFeatureViolations,
        exceptions: CROSS_FEATURE_EXCEPTIONS,
    },
    {
        rule: "services and session participants import only the listed infrastructure",
        violations: serviceToInfrastructureViolations,
        exceptions: SERVICE_INFRASTRUCTURE_EXCEPTIONS,
    },
    {
        rule: "only inbound *MessageHandlers adapters in infrastructure import services",
        violations: adapterToServiceViolations,
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
const httpClient = moduleAt("deployment", "infrastructure", "FetchHttpClient.ts");
const deploymentHandlers = moduleAt("deployment", "infrastructure", "deploymentMessageHandlers.ts");
const sharedErrors = moduleAt("shared", "domain", "errors.ts");
const artifactService = moduleAt("shared", "service", "ArtifactService.ts");
const marketplaceService = moduleAt(
    "template-marketplace",
    "service",
    "TemplateMarketplaceService.ts",
);
const gitHubSource = moduleAt("template-marketplace", "infrastructure", "GitHubSource.ts");

/** Every edge here is allowed by every rule. */
const LAYERED_GRAPH: readonly ImportEdge[] = [
    edge(deploymentTarget, deploymentPorts),
    edge(deploymentTarget, sharedErrors),
    edge(deploymentTarget, "@miragon/bpmn-modeler-types"),
    edge(deploymentTarget, "path"),
    edge(deploymentService, deploymentTarget),
    edge(deploymentService, artifactService),
    edge(deploymentParticipant, deploymentService),
    edge(deploymentFeature, deploymentService),
    edge(deploymentFeature, httpClient),
    edge(deploymentHandlers, deploymentService),
    edge(httpClient, deploymentPorts),
    edge(marketplaceService, sharedErrors),
    edge(gitHubSource, "bpmnlint"),
];

describe("import reading", () => {
    it.each([
        { form: "a static import", source: 'import { a } from "./a";' },
        { form: "a type-only import", source: 'import type { A } from "./a";' },
        { form: "a re-export", source: 'export { a } from "./a";' },
        { form: "a side-effect import", source: 'import "./a";' },
        { form: "a dynamic import", source: 'const a = import("./a");' },
        { form: "a require call", source: 'const a = require("./a");' },
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
        { path: "shared/service/ArtifactService.ts", feature: "shared", layer: "service" },
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
                [service.path, ["../domain/b", "bpmnlint", "../../testing/fake"]],
                [domain.path, []],
                ["deployment/service/bpmnlint.ts", []],
                ["testing/fake.ts", ["../deployment/service/A"]],
            ]),
        );

        expect(edges).toEqual([
            { from: service, specifier: "../domain/b", to: domain },
            { from: service, specifier: "bpmnlint" },
            { from: service, specifier: "../../testing/fake" },
        ]);
    });
});

describe("host reach", () => {
    it.each(["vscode", "node:fs", "fs", "fs/promises", "http", "https"])(
        "treats %s as a host module",
        (specifier) => {
            expect(hostReachingFiles(new Map([["shared/service/A.ts", [specifier]]]))).toEqual(
                new Set(["shared/service/A.ts"]),
            );
        },
    );

    it.each(["path", "@miragon/bpmn-modeler-types"])(
        "does not treat %s as a host module",
        (specifier) => {
            expect(hostReachingFiles(new Map([["shared/service/A.ts", [specifier]]]))).toEqual(
                new Set(),
            );
        },
    );

    it("marks every file that reaches a host module through relative imports", () => {
        const reaching = hostReachingFiles(
            new Map([
                ["deployment/infrastructure/FetchHttpClient.ts", ["node:http"]],
                ["deployment/DeploymentFeature.ts", ["./infrastructure/FetchHttpClient"]],
                ["index.ts", ["./deployment/DeploymentFeature"]],
                ["deployment/domain/envRef.ts", ["path"]],
            ]),
        );

        expect([...reaching].sort()).toEqual([
            "deployment/DeploymentFeature.ts",
            "deployment/infrastructure/FetchHttpClient.ts",
            "index.ts",
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
            offending: edge(deploymentTarget, httpClient),
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
            name: "shared → a feature",
            violations: crossFeatureViolations,
            offending: edge(artifactService, deploymentService),
        },
        {
            name: "service → infrastructure",
            violations: serviceToInfrastructureViolations,
            offending: edge(deploymentService, httpClient),
        },
        {
            name: "session → infrastructure",
            violations: serviceToInfrastructureViolations,
            offending: edge(deploymentParticipant, httpClient),
        },
        {
            name: "non-handler infrastructure → service",
            violations: adapterToServiceViolations,
            offending: edge(httpClient, deploymentService),
        },
    ])("flags $name and nothing else", ({ violations, offending }) => {
        expect(violations([...LAYERED_GRAPH, offending])).toEqual([offending]);
    });

    it.each([
        { name: "a layered graph", graph: LAYERED_GRAPH, cycles: [] },
        {
            name: "a two-file cycle",
            graph: [...LAYERED_GRAPH, edge(deploymentTarget, deploymentService)],
            cycles: [[deploymentTarget.path, deploymentService.path, deploymentTarget.path]],
        },
        {
            name: "a cycle reached through a file outside it",
            graph: [
                edge(deploymentFeature, deploymentService),
                edge(deploymentService, deploymentTarget),
                edge(deploymentTarget, deploymentService),
            ],
            cycles: [[deploymentService.path, deploymentTarget.path, deploymentService.path]],
        },
        {
            name: "a self-import",
            graph: [edge(sharedErrors, sharedErrors)],
            cycles: [[sharedErrors.path, sharedErrors.path]],
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
            exception: { from: "*", to: httpClient.path },
            violation: edge(deploymentService, httpClient),
            covers: true,
        },
        {
            name: "a wildcard importer does not widen the target",
            exception: { from: "*", to: httpClient.path },
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
        expect(importCycles(edges).map((cycle) => cycle.join(" -> "))).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        const stale = LAYER_RULES.flatMap(({ violations, exceptions }) =>
            staleExceptions(violations(edges), exceptions),
        );
        expect(stale).toEqual([]);
    });
});
