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
 * Architecture gate for `@miragon/bpmn-modeler-types`, on top of the shared
 * role-folder rules the repo-level spec applies to every hexagonal workspace.
 * Each file sits in a folder by concept with `domain/` and `service/` inside.
 * Only `lifecycle/` has a `service/`: its debounces wait on timers, so the root
 * barrel that re-exports them is not pure and `src/domain.ts` is the entry a
 * pure importer reads. `domain/` imports only pure modules
 * (docs/adr/role-folders.md#domain-imports), and no file reaches a host module,
 * as the library runs in Node and the browser. A known exception names the
 * issue that removes it, and one the code no longer needs fails the gate.
 */
const SRC_ROOT = __dirname;

const IS_PURE_MODULE = readModulePurity(join(SRC_ROOT, "../../.."));

/** What each folder may import besides itself. */
const FOLDER_READS: ReadonlyMap<string, readonly string[]> = new Map([
    ["engine", []],
    ["documents", []],
    ["geometry", []],
    ["lint", []],
    ["merge", []],
    ["scripting", []],
    ["lifecycle", []],
    ["surface", ["engine"]],
    ["diff", ["surface"]],
    ["elements", ["engine", "surface"]],
    ["references", ["documents"]],
]);

/** The path before the role folder; a folder of the library only if `FOLDER_READS` names it. */
function folderOf(path: string): string | undefined {
    return roleOf(path)?.context;
}

/** No `port/` or `adapter/`: the library does no I/O. */
const FOLDER_ROLES: readonly Role[] = ["domain", "service"];

function filesOutsideFolders({ files }: ImportGraph): Violation[] {
    return files
        .filter((path) => !isEntry(path) && !sitsInAFolderRole(path))
        .map((path) => ({ from: path, to: "(no folder)" }));
}

function sitsInAFolderRole(path: string): boolean {
    const location = roleOf(path);
    return (
        location !== undefined &&
        FOLDER_READS.has(location.context) &&
        FOLDER_ROLES.includes(location.role)
    );
}

function unlistedFolderImports({ edges }: ImportGraph): Violation[] {
    return edges.flatMap(({ from, to }) => {
        if (to === undefined) {
            return [];
        }
        const fromFolder = folderOf(from) ?? "";
        const toFolder = folderOf(to) ?? "";
        const reads = FOLDER_READS.get(fromFolder);
        return reads !== undefined &&
            FOLDER_READS.has(toFolder) &&
            toFolder !== fromFolder &&
            !reads.includes(toFolder)
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
            rule: "every file but an entry sits in a folder's domain/ or service/",
            violations: filesOutsideFolders,
            exceptions: [],
        },
        {
            rule: "a folder imports only the folders it builds on: surface engine, diff surface, elements engine and surface, references documents, the rest none",
            violations: unlistedFolderImports,
            exceptions: [],
        },
        {
            rule: "domain imports no package but a pure module",
            violations: domainPackageViolations(isPureModule),
            exceptions: [],
        },
    ];
}

const LIBRARY_RULES = libraryRules(IS_PURE_MODULE);

function importsOf(...specifiers: string[]): string {
    return specifiers.map((specifier) => `import "${specifier}";`).join("\n");
}

/** Every import here is allowed by every rule. */
const FOLDER_TREE = [
    {
        path: "index.ts",
        text: importsOf("./diff/domain/legend", "./lifecycle/service/debounce"),
    },
    { path: "domain.ts", text: importsOf("./diff/domain/legend", "./references/domain/search") },
    { path: "engine/domain/engine.ts", text: "" },
    { path: "documents/domain/markup.ts", text: "" },
    { path: "lifecycle/service/debounce.ts", text: 'import debounce from "lodash/debounce.js";' },
    { path: "surface/domain/mode.ts", text: importsOf("../../engine/domain/engine") },
    { path: "diff/domain/legend.ts", text: importsOf("../../surface/domain/mode") },
    {
        path: "elements/domain/templates.ts",
        text: importsOf("../../engine/domain/engine", "../../surface/domain/mode"),
    },
    { path: "references/domain/search.ts", text: importsOf("../../documents/domain/markup") },
];

function violationsWith(path: string, text: string): string[] {
    const graph = buildImportGraph([...FOLDER_TREE, { path, text }]);
    return libraryRules(() => false).flatMap(({ violations }) =>
        violations(graph).map(describeViolation),
    );
}

describe("library rules on a synthetic graph", () => {
    it("pass a tree whose folders read only the folders they build on", () => {
        expect(violationsWith("geometry/domain/x.ts", "")).toEqual([]);
    });

    it.each([
        {
            name: "a file in no folder",
            path: "widgets/domain/x.ts",
            text: "",
            violation: "widgets/domain/x.ts -> (no folder)",
        },
        {
            name: "a file directly in a role folder",
            path: "domain/x.ts",
            text: "",
            violation: "domain/x.ts -> (no folder)",
        },
        {
            name: "a folder nested in another",
            path: "diff/surface/domain/x.ts",
            text: "",
            violation: "diff/surface/domain/x.ts -> (no folder)",
        },
        {
            name: "a port/ in a folder",
            path: "engine/port/x.ts",
            text: "",
            violation: "engine/port/x.ts -> (no folder)",
        },
        {
            name: "an adapter/ in a folder",
            path: "lifecycle/adapter/out/x.ts",
            text: "",
            violation: "lifecycle/adapter/out/x.ts -> (no folder)",
        },
        {
            name: "engine → surface",
            path: "engine/domain/x.ts",
            text: importsOf("../../surface/domain/mode"),
            violation: "engine/domain/x.ts -> surface/domain/mode.ts",
        },
        {
            name: "diff → engine",
            path: "diff/domain/x.ts",
            text: importsOf("../../engine/domain/engine"),
            violation: "diff/domain/x.ts -> engine/domain/engine.ts",
        },
        {
            name: "references → elements",
            path: "references/domain/x.ts",
            text: importsOf("../../elements/domain/templates"),
            violation: "references/domain/x.ts -> elements/domain/templates.ts",
        },
        {
            name: "a domain folder → lifecycle",
            path: "merge/domain/x.ts",
            text: importsOf("../../lifecycle/service/debounce"),
            violation: "merge/domain/x.ts -> lifecycle/service/debounce.ts",
        },
        {
            name: "domain → an npm package, even type-only",
            path: "geometry/domain/x.ts",
            text: 'import type { DebouncedFunc } from "lodash";',
            violation: "geometry/domain/x.ts -> lodash",
        },
    ])("flag $name and nothing else", ({ path, text, violation }) => {
        expect(violationsWith(path, text)).toEqual([violation]);
    });
});

describe("modeler-types architecture", () => {
    const graph = buildImportGraph(readSourceTree(SRC_ROOT));

    it("reads the domain entry as a pure module, the root entry not", () => {
        expect(
            ["@miragon/bpmn-modeler-types/domain", "@miragon/bpmn-modeler-types"].filter(
                IS_PURE_MODULE,
            ),
        ).toEqual(["@miragon/bpmn-modeler-types/domain"]);
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
