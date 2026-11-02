import {
    buildImportGraph,
    exceptionsWithoutIssue,
    filesReaching,
    isHostModule,
    readSourceTree,
    staleExceptions,
    unexcusedViolations,
} from "@miragon/architecture-testing";
import type {
    ImportEdge as GraphEdge,
    KnownException,
    Violation,
} from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

/**
 * Architecture gate for `@miragon/bpmn-modeler-core`. The engine stays
 * host-agnostic: no file imports `vscode` or reaches a Node host module
 * (`node:*`, `fs`, `http`). Pure Node utilities that exist in any Node host
 * (`path`, `Buffer`) are allowed; they are not host capabilities.
 *
 * Inside the core, layers point inward, features meet only in `kernel/` and
 * `editorSession/`, and `kernel/` imports nothing outside itself. A known
 * exception names the issue that removes it, and an exception the code no
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

const LAYER_FOLDERS: readonly Layer[] = ["domain", "service", "session", "infrastructure"];
const APPLICATION_LAYERS: readonly Layer[] = ["service", "session"];
const DOMAIN_PACKAGES: readonly string[] = ["@miragon/bpmn-modeler-types", "path"];
const KERNEL_FEATURE = "kernel";
const SUBSTRATE: readonly string[] = [KERNEL_FEATURE, "editorSession"];
const INBOUND_ADAPTER = /MessageHandlers\.ts$/;

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

function readEdges(graphEdges: readonly GraphEdge[]): ImportEdge[] {
    return graphEdges.flatMap(({ from: fromPath, specifier, to: toPath }) => {
        const from = classify(fromPath);
        if (from === "exempt") {
            return [];
        }
        const to = toPath === undefined ? undefined : classify(toPath);
        return [
            to === undefined || to === "exempt" ? { from, specifier } : { from, specifier, to },
        ];
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

function asViolation({ from, specifier, to }: ImportEdge): Violation {
    return { from: from.path, to: to?.path ?? specifier };
}

function describeViolation({ from, to }: Violation): string {
    return `${from} -> ${to}`;
}

interface LayerRule {
    readonly rule: string;
    readonly violations: (edges: readonly ImportEdge[]) => ImportEdge[];
    readonly exceptions: readonly KnownException[];
}

const LAYER_RULES: readonly LayerRule[] = [
    {
        rule: "domain imports no package but @miragon/bpmn-modeler-types and path",
        violations: domainPackageViolations,
        exceptions: [],
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
];

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
const editorSessionStore = moduleAt("editorSession", "service", "EditorSessionStore.ts");
const editorSessionLifecycle = moduleAt("editorSession", "service", "EditorSessionLifecycle.ts");
const kernelErrors = moduleAt("kernel", "domain", "errors.ts");
const kernelHostPorts = moduleAt("kernel", "domain", "hostPorts.ts");
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
    edge(deploymentService, editorSessionStore),
    edge(editorSessionLifecycle, editorSessionStore),
    edge(editorSessionLifecycle, sessionParticipantContract),
    edge(editorSessionLifecycle, kernelHostPorts),
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
            path: "editorSession/session/DocumentRenderParticipant.ts",
            feature: "editorSession",
            layer: "session",
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
        const graph = buildImportGraph([
            {
                path: service.path,
                text: ["../domain/b", "bpmnlint", "../../testing/fake", "../domain/b.js"]
                    .map((specifier) => `import "${specifier}";`)
                    .join("\n"),
            },
            { path: domain.path, text: "" },
            { path: "deployment/service/bpmnlint.ts", text: "" },
            { path: "testing/fake.ts", text: 'import "../deployment/service/A";' },
        ]);

        expect(readEdges(graph.edges)).toEqual([
            { from: service, specifier: "../domain/b", to: domain },
            { from: service, specifier: "bpmnlint" },
            { from: service, specifier: "../../testing/fake" },
            { from: service, specifier: "../domain/b.js" },
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
            name: "domain → an editorSession service",
            violations: domainLayerViolations,
            offending: edge(deploymentTarget, editorSessionStore),
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
});

describe("modeler-core architecture", () => {
    const graph = buildImportGraph(readSourceTree(SRC_ROOT));
    const edges = readEdges(graph.edges);

    it("no engine file imports vscode", () => {
        const offenders = graph.edges
            .filter(({ specifier }) => specifier === "vscode")
            .map(({ from }) => from);
        expect(
            offenders,
            `@miragon/bpmn-modeler-core must be vscode-free; these import it:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no engine file transitively reaches a host module", () => {
        const offenders = [...filesReaching(graph, isHostModule)];
        expect(
            offenders,
            `these transitively import a host module (vscode/node:*/fs/http) — ` +
                `the engine must reach the host only through ports:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it.each(LAYER_RULES)("$rule", ({ violations, exceptions }) => {
        expect(
            unexcusedViolations(violations(edges).map(asViolation), exceptions).map(
                describeViolation,
            ),
        ).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        const stale = LAYER_RULES.flatMap(({ violations, exceptions }) =>
            staleExceptions(violations(edges).map(asViolation), exceptions),
        );
        expect(stale).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        expect(exceptionsWithoutIssue(LAYER_RULES.flatMap(({ exceptions }) => exceptions))).toEqual(
            [],
        );
    });
});
