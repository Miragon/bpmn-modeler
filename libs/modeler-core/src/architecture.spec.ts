import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture gate for `@miragon/bpmn-modeler-core`: the engine must stay
 * host-agnostic. The package-wide invariant is "no `vscode`, ever"; the
 * `domain/` layer additionally avoids Node host modules (`node:*`, `fs`,
 * `http`). Pure Node utilities that exist in any Node host (`path`, `Buffer`)
 * are allowed — they are not host capabilities.
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

function readSource(file: string): string {
    return readFileSync(join(SRC_ROOT, file), "utf8");
}

const SPECIFIER_PATTERNS: readonly RegExp[] = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']/g,
];

function importSpecifiers(content: string): string[] {
    return SPECIFIER_PATTERNS.flatMap((pattern) =>
        [...content.matchAll(pattern)].map((match) => match[1]),
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
    known: Set<string>,
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
function hostReachingFiles(files: string[]): Set<string> {
    const known = new Set(files);
    const importers = new Map<string, string[]>();
    const tainted = new Set<string>();
    for (const file of files) {
        const specifiers = importSpecifiers(readSource(file));
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

function classify(_path: string): ModuleRef | "exempt" {
    return "exempt";
}

function readEdges(_importsByFile: ReadonlyMap<string, readonly string[]>): ImportEdge[] {
    return [];
}

function domainPackageViolations(_edges: readonly ImportEdge[]): ImportEdge[] {
    return [];
}

function domainLayerViolations(_edges: readonly ImportEdge[]): ImportEdge[] {
    return [];
}

function crossFeatureViolations(_edges: readonly ImportEdge[]): ImportEdge[] {
    return [];
}

function serviceToInfrastructureViolations(_edges: readonly ImportEdge[]): ImportEdge[] {
    return [];
}

function adapterToServiceViolations(_edges: readonly ImportEdge[]): ImportEdge[] {
    return [];
}

function importCycles(_edges: readonly ImportEdge[]): string[][] {
    return [];
}

function unexcused(
    violations: readonly ImportEdge[],
    _exceptions: readonly KnownException[],
): ImportEdge[] {
    return [...violations];
}

function staleExceptions(
    _violations: readonly ImportEdge[],
    _exceptions: readonly KnownException[],
): KnownException[] {
    return [];
}

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
                [
                    service.path,
                    ["../domain/b", "@miragon/bpmn-modeler-types", "../../testing/fake"],
                ],
                [domain.path, []],
                ["testing/fake.ts", ["../deployment/service/A"]],
            ]),
        );

        expect(edges).toEqual([
            { from: service, specifier: "../domain/b", to: domain },
            { from: service, specifier: "@miragon/bpmn-modeler-types" },
            { from: service, specifier: "../../testing/fake" },
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
    const files = listSourceFiles();

    it("no engine file imports vscode", () => {
        const offenders = files.filter((file) =>
            importSpecifiers(readSource(file)).includes("vscode"),
        );
        expect(
            offenders,
            `@miragon/bpmn-modeler-core must be vscode-free; these import it:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("domain does not import vscode or Node host modules", () => {
        const offenders = files.filter(
            (file) =>
                file.includes("/domain/") && importSpecifiers(readSource(file)).some(isHostModule),
        );
        expect(
            offenders,
            `domain must not import vscode / node:* / fs / http:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no engine file transitively reaches a host module", () => {
        const tainted = hostReachingFiles(files);
        const offenders = files.filter((file) => tainted.has(file));
        expect(
            offenders,
            `these transitively import a host module (vscode/node:*/fs/http) — ` +
                `the engine must reach the host only through ports:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });
});
