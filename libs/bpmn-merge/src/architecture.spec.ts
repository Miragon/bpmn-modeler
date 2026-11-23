import {
    buildImportGraph,
    exceptionsWithoutIssue,
    filesReaching,
    impureDomainImports,
    isEntry,
    isHostModule,
    readModulePurity,
    readSourceTree,
    roleOf,
    staleExceptions,
    unexcusedViolations,
} from "@miragon/architecture-testing";
import type {
    ImportEdge,
    ImportGraph,
    KnownException,
    ModulePurity,
    Role,
    Violation,
} from "@miragon/architecture-testing";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture gate for `@miragon/bpmn-modeler-merge`, on top of the shared
 * role-folder rules the repo-level spec applies to every hexagonal workspace.
 * The library is a pipeline of stages, each a folder with `domain/` and
 * `service/` inside, and the vocabulary they share in `kernel/`. A stage
 * imports only `kernel/` and the stages before it; `build` and `project` both
 * read `sources` and neither reads the other. `domain/` imports only pure
 * modules (docs/adr/role-folders.md#domain-imports), and no file reaches a
 * host module: the core's engine runs the library and stays host-agnostic only
 * if the library does, as the core's own check stops at its package imports. A
 * known exception names the issue that removes it, and one the code no longer
 * needs fails the gate.
 */
const SRC_ROOT = __dirname;

const IS_PURE_MODULE = readModulePurity(join(SRC_ROOT, "../../.."));

/** What each stage may import besides itself. */
const STAGE_READS: ReadonlyMap<string, readonly string[]> = new Map([
    ["kernel", []],
    ["classify", ["kernel"]],
    ["decide", ["kernel", "classify"]],
    ["sources", ["kernel", "classify", "decide"]],
    ["build", ["kernel", "classify", "decide", "sources"]],
    ["project", ["kernel", "classify", "decide", "sources"]],
]);

/** The path before the role folder; a stage only if `STAGE_READS` names it. */
function stageOf(path: string): string | undefined {
    return roleOf(path)?.context;
}

/** No `port/` or `adapter/`: the library does no I/O. */
const STAGE_ROLES: readonly Role[] = ["domain", "service"];

function filesOutsideStages({ files }: ImportGraph): Violation[] {
    return files
        .filter((path) => !isEntry(path) && !sitsInAStageRole(path))
        .map((path) => ({ from: path, to: "(no stage)" }));
}

function sitsInAStageRole(path: string): boolean {
    const location = roleOf(path);
    return (
        location !== undefined &&
        STAGE_READS.has(location.context) &&
        STAGE_ROLES.includes(location.role)
    );
}

function laterStageImports({ edges }: ImportGraph): Violation[] {
    return edges.flatMap(({ from, to }) => {
        if (to === undefined) {
            return [];
        }
        const fromStage = stageOf(from) ?? "";
        const toStage = stageOf(to) ?? "";
        const reads = STAGE_READS.get(fromStage);
        return reads !== undefined &&
            STAGE_READS.has(toStage) &&
            toStage !== fromStage &&
            !reads.includes(toStage)
            ? [{ from, to }]
            : [];
    });
}

function domainPackageViolations(isPureModule: ModulePurity) {
    return (graph: ImportGraph): Violation[] =>
        impureDomainImports(graph, isPureModule).map(asViolation);
}

function asViolation({ from, specifier, to }: ImportEdge): Violation {
    return { from, to: to ?? specifier };
}

function describeViolation({ from, to }: Violation): string {
    return `${from} -> ${to}`;
}

interface LibraryRule {
    readonly rule: string;
    readonly violations: (graph: ImportGraph) => Violation[];
    readonly exceptions: readonly KnownException[];
}

function libraryRules(isPureModule: ModulePurity): readonly LibraryRule[] {
    return [
        {
            rule: "every file but an entry sits in a stage's domain/ or service/",
            violations: filesOutsideStages,
            exceptions: [],
        },
        {
            rule: "a stage imports only kernel/ and the stages before it, build and project not each other",
            violations: laterStageImports,
            exceptions: [],
        },
        {
            rule: "domain imports no package but a pure module",
            violations: domainPackageViolations(isPureModule),
            exceptions: [
                {
                    from: "*",
                    to: "@miragon/bpmn-modeler-types",
                    until: "#2776: the types library compiles with the DOM for ten canvas and chrome modules",
                },
            ],
        },
    ];
}

const LIBRARY_RULES = libraryRules(IS_PURE_MODULE);

function importsOf(...specifiers: string[]): string {
    return specifiers.map((specifier) => `import "${specifier}";`).join("\n");
}

/** Every import here is allowed by every rule. */
const STAGE_TREE = [
    { path: "index.ts", text: importsOf("./build/service/buildMerged", "./decide/domain/picks") },
    { path: "domain.ts", text: importsOf("./decide/domain/picks") },
    { path: "kernel/domain/result.ts", text: "" },
    { path: "classify/domain/states.ts", text: importsOf("../../kernel/domain/result") },
    { path: "classify/service/classify.ts", text: importsOf("../domain/states") },
    {
        path: "decide/domain/picks.ts",
        text: importsOf("../../kernel/domain/result", "../../classify/domain/states"),
    },
    {
        path: "sources/service/prepare.ts",
        text: importsOf("../../classify/service/classify", "../../decide/domain/picks"),
    },
    { path: "sources/domain/sources.ts", text: importsOf("@miragon/bpmn-modeler-diff/domain") },
    {
        path: "build/service/buildMerged.ts",
        text: importsOf("../../sources/service/prepare", "../domain/layout/repair"),
    },
    { path: "build/domain/layout/repair.ts", text: importsOf("../../../sources/domain/sources") },
    {
        path: "project/domain/paneView.ts",
        text: importsOf("../../decide/domain/picks", "../../sources/domain/sources"),
    },
];

function violationsWith(path: string, text: string): string[] {
    const graph = buildImportGraph([...STAGE_TREE, { path, text }]);
    return libraryRules((specifier) => specifier === "@miragon/bpmn-modeler-diff/domain").flatMap(
        ({ violations }) => violations(graph).map(describeViolation),
    );
}

describe("library rules on a synthetic graph", () => {
    it("pass a tree whose stages read only kernel/ and the stages before them, build and project not each other", () => {
        expect(violationsWith("kernel/domain/x.ts", "")).toEqual([]);
    });

    it.each([
        {
            name: "a file in no stage",
            path: "layout/domain/x.ts",
            text: "",
            violation: "layout/domain/x.ts -> (no stage)",
        },
        {
            name: "a stage nested in another",
            path: "build/layout/domain/x.ts",
            text: "",
            violation: "build/layout/domain/x.ts -> (no stage)",
        },
        {
            name: "a port/ in a stage",
            path: "decide/port/x.ts",
            text: "",
            violation: "decide/port/x.ts -> (no stage)",
        },
        {
            name: "an adapter/ in a stage",
            path: "build/adapter/out/x.ts",
            text: "",
            violation: "build/adapter/out/x.ts -> (no stage)",
        },
        {
            name: "an earlier stage → a later one",
            path: "decide/domain/x.ts",
            text: importsOf("../../build/domain/layout/repair"),
            violation: "decide/domain/x.ts -> build/domain/layout/repair.ts",
        },
        {
            name: "kernel → a stage",
            path: "kernel/domain/x.ts",
            text: importsOf("../../classify/domain/states"),
            violation: "kernel/domain/x.ts -> classify/domain/states.ts",
        },
        {
            name: "project → build",
            path: "project/domain/x.ts",
            text: importsOf("../../build/domain/layout/repair"),
            violation: "project/domain/x.ts -> build/domain/layout/repair.ts",
        },
        {
            name: "build → project",
            path: "build/domain/x.ts",
            text: importsOf("../../project/domain/paneView"),
            violation: "build/domain/x.ts -> project/domain/paneView.ts",
        },
        {
            name: "domain → an npm package, even type-only",
            path: "decide/domain/x.ts",
            text: 'import type { Parser } from "saxen";',
            violation: "decide/domain/x.ts -> saxen",
        },
    ])("flag $name and nothing else", ({ path, text, violation }) => {
        expect(violationsWith(path, text)).toEqual([violation]);
    });
});

describe("bpmn-merge architecture", () => {
    const graph = buildImportGraph(readSourceTree(SRC_ROOT));

    it("reads the domain entry as a pure module, the root entry not", () => {
        expect(
            ["@miragon/bpmn-modeler-merge/domain", "@miragon/bpmn-modeler-merge"].filter(
                IS_PURE_MODULE,
            ),
        ).toEqual(["@miragon/bpmn-modeler-merge/domain"]);
    });

    it("no file transitively reaches a host module", () => {
        expect([...filesReaching(graph, isHostModule)]).toEqual([]);
    });

    it.each(LIBRARY_RULES)("$rule", ({ violations, exceptions }) => {
        expect(unexcusedViolations(violations(graph), exceptions).map(describeViolation)).toEqual(
            [],
        );
    });

    it("lists no exception the code no longer needs", () => {
        const stale = LIBRARY_RULES.flatMap(({ violations, exceptions }) =>
            staleExceptions(violations(graph), exceptions),
        );
        expect(stale).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        expect(
            exceptionsWithoutIssue(LIBRARY_RULES.flatMap(({ exceptions }) => exceptions)),
        ).toEqual([]);
    });
});
