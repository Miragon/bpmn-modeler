import {
    buildImportGraph,
    filesReaching,
    findPortAdapters,
    isHostModule,
    portAdapterViolations,
    readSourceTree,
    requireMatches,
} from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

/**
 * Executable architecture tests. They turn the four-layer +
 * feature-folder design — until now held by discipline alone — into CI gates so
 * regressions break the build instead of rotting silently.
 *
 * All blocks are **regression locks that must stay green**: layer purity
 * (no inward layer reaches outward, no `vscode`/host modules leak into
 * `domain`/`service`) and feature isolation (a feature may reach a sibling
 * only through its `index.ts` barrel). Import cycles are banned for every
 * workspace in `tools/repo-checks`.
 */
const tree = readSourceTree(__dirname);
const graph = buildImportGraph(tree);

function hasSegment(path: string, segment: string): boolean {
    return path.split("/").includes(segment);
}

function isInFolder(path: string, folder: string): boolean {
    return path.startsWith(`${folder}/`);
}

describe("architecture", () => {
    // ─── A. Host isolation — regression lock, must stay GREEN ────────────────
    //
    // The host-agnostic engine (every `domain/`/`service/` layer plus the
    // vscode-free registries) now lives in `@miragon/bpmn-modeler-core`, gated
    // by that package's own `architecture.spec.ts`. What remains here is VS Code
    // host code (`Vs*` adapters, controllers, participants, composition root),
    // which legitimately imports `vscode`.
    //
    // This guard is the regression lock against the engine creeping back into
    // the plugin: if a `domain/`/`service/` file is ever (re)introduced here, it
    // must reach the host only through ports — never by importing a concrete
    // `Vs*` adapter, directly or transitively. No such folder exists today, so
    // an empty scope is the goal here, not a broken path.
    describe("host isolation (regression lock — green)", () => {
        it("any domain/service code does not transitively reach a host module", () => {
            const offenders = [...filesReaching(graph, isHostModule)].filter(
                (file) => hasSegment(file, "domain") || hasSegment(file, "service"),
            );
            expect(
                offenders,
                `domain/service must reach the host only through ports, but these ` +
                    `transitively import a host module (e.g. a service importing a ` +
                    `concrete Vs* adapter):\n${offenders.join("\n")}`,
            ).toEqual([]);
        });
    });

    // ─── A2. Ports, not adapters — regression lock, must stay GREEN ──────────
    //
    // A class implementing a core port is an adapter, built once by the
    // composition root and handed to controllers, participants and handlers as
    // the port. A controller importing the adapter would bind to VS Code where
    // the in-memory test kit — and a future core feature — expect the port.
    // Placement is asserted by path: a misplaced adapter that only the
    // composition root imports breaks no import rule.
    describe("ports, not adapters (regression lock — green)", () => {
        it("port adapters live in infrastructure or composition, and only those import them", () => {
            const adapters = requireMatches("port adapters", findPortAdapters(tree));
            const { misplacedAdapters, adapterImporters } = portAdapterViolations(
                adapters,
                graph,
                (path) => isInFolder(path, "composition") || hasSegment(path, "infrastructure"),
            );
            const offenders = [
                ...misplacedAdapters.map(
                    (adapter) =>
                        `${adapter} implements a port, so it belongs in infrastructure/ or composition/`,
                ),
                ...adapterImporters.map(({ from, to }) => `${from} → ${to}`),
            ];
            expect(
                offenders,
                `a port adapter belongs in infrastructure/ or composition/, and code elsewhere ` +
                    `takes the core port instead of the concrete adapter:\n${offenders.join("\n")}`,
            ).toEqual([]);
        });
    });

    // ─── C. Feature isolation — regression lock, must stay GREEN ─────────────
    //
    // A feature may import a sibling feature only through that sibling's
    // `index.ts` barrel; reaching into its internals is forbidden. Encoded
    // pairwise — source = feature A, target = feature B's files except its
    // `index.ts`. `composition/` and `shared/` (and the generic
    // `modeler/editor-session/` host) are intentionally absent from
    // FEATURE_FOLDERS: the composition root wires features together and the
    // others are common substrate, so none is subject to isolation. Do NOT relax
    // the rules to make CI green; that defeats the gate.
    describe("feature isolation (regression lock — green)", () => {
        // `migration` is intentionally absent: after the engine extraction its
        // only plugin-side file is an `index.ts` barrel. The DMN editor has no
        // plugin-side code left at all.
        const FEATURE_FOLDERS = ["diff", "deployment", "scriptTask", "modeler/bpmn"];

        for (const sourceFeature of FEATURE_FOLDERS) {
            for (const targetFeature of FEATURE_FOLDERS) {
                if (sourceFeature === targetFeature) {
                    continue;
                }
                it(`${sourceFeature} does not import ${targetFeature} internals`, () => {
                    const offenders = graph.edges
                        .filter(
                            ({ from, to }) =>
                                to !== undefined &&
                                isInFolder(from, sourceFeature) &&
                                isInFolder(to, targetFeature) &&
                                to !== `${targetFeature}/index.ts`,
                        )
                        .map(({ from, to }) => `${from} → ${to}`);
                    expect(offenders).toEqual([]);
                });
            }
        }
    });
});
