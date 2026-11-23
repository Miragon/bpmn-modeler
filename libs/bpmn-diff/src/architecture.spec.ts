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
 * Architecture gate for `@miragon/bpmn-modeler-diff`, on top of the shared
 * role-folder rules the repo-level spec applies to every hexagonal workspace.
 * Each file sits in a folder by concept with `domain/` and `service/` inside.
 * `moddle/` reads nothing else, so it can leave for a library of its own
 * (#2466); `present/`, what a pane reads of a result, reads nothing either.
 * `domain/` imports only pure modules (docs/adr/role-folders.md#domain-imports),
 * and no file reaches a host module, as the library runs in Node and the
 * browser. A known exception names the issue that removes it, and one the code
 * no longer needs fails the gate.
 */
const SRC_ROOT = __dirname;

const IS_PURE_MODULE = readModulePurity(join(SRC_ROOT, "../../.."));

/** What each folder may import besides itself. */
const FOLDER_READS: ReadonlyMap<string, readonly string[]> = new Map([
    ["moddle", []],
    ["present", []],
    ["parse", ["moddle"]],
    ["compare", ["moddle", "parse", "present"]],
    ["snapshot", ["moddle", "parse", "compare"]],
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
            rule: "a folder imports only the folders it builds on: moddle and present none, parse moddle, compare moddle, parse and present, snapshot moddle, parse and compare",
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
        text: importsOf("./compare/service/computeDiff", "./snapshot/service/elementXml"),
    },
    { path: "domain.ts", text: importsOf("./moddle/domain/element", "./snapshot/domain/snapshot") },
    { path: "moddle/domain/element.ts", text: "" },
    { path: "moddle/service/loader.ts", text: importsOf("../domain/element") },
    { path: "present/domain/result.ts", text: "" },
    { path: "parse/domain/prefixes.ts", text: importsOf("../../moddle/domain/element") },
    {
        path: "parse/service/scan.ts",
        text: importsOf("../domain/prefixes", "../../moddle/service/loader"),
    },
    { path: "compare/domain/tracked.ts", text: importsOf("../../moddle/domain/element") },
    {
        path: "compare/service/computeDiff.ts",
        text: importsOf(
            "../../parse/service/scan",
            "../../present/domain/result",
            "../domain/tracked",
        ),
    },
    {
        path: "snapshot/domain/snapshot.ts",
        text: importsOf("../../compare/domain/tracked", "../../parse/domain/prefixes"),
    },
    {
        path: "snapshot/service/elementXml.ts",
        text: importsOf("../domain/snapshot", "../../parse/service/scan"),
    },
];

function violationsWith(path: string, text: string): string[] {
    const graph = buildImportGraph([...FOLDER_TREE, { path, text }]);
    return libraryRules(() => false).flatMap(({ violations }) =>
        violations(graph).map(describeViolation),
    );
}

describe("library rules on a synthetic graph", () => {
    it("pass a tree whose folders read only the folders they build on", () => {
        expect(violationsWith("moddle/domain/x.ts", "")).toEqual([]);
    });

    it.each([
        {
            name: "a file in no folder",
            path: "layout/domain/x.ts",
            text: "",
            violation: "layout/domain/x.ts -> (no folder)",
        },
        {
            name: "a folder nested in another",
            path: "compare/parse/domain/x.ts",
            text: "",
            violation: "compare/parse/domain/x.ts -> (no folder)",
        },
        {
            name: "a port/ in a folder",
            path: "parse/port/x.ts",
            text: "",
            violation: "parse/port/x.ts -> (no folder)",
        },
        {
            name: "an adapter/ in a folder",
            path: "snapshot/adapter/out/x.ts",
            text: "",
            violation: "snapshot/adapter/out/x.ts -> (no folder)",
        },
        {
            name: "moddle → parse",
            path: "moddle/domain/x.ts",
            text: importsOf("../../parse/domain/prefixes"),
            violation: "moddle/domain/x.ts -> parse/domain/prefixes.ts",
        },
        {
            name: "present → moddle",
            path: "present/domain/x.ts",
            text: importsOf("../../moddle/domain/element"),
            violation: "present/domain/x.ts -> moddle/domain/element.ts",
        },
        {
            name: "parse → compare",
            path: "parse/domain/x.ts",
            text: importsOf("../../compare/domain/tracked"),
            violation: "parse/domain/x.ts -> compare/domain/tracked.ts",
        },
        {
            name: "compare → snapshot",
            path: "compare/domain/x.ts",
            text: importsOf("../../snapshot/domain/snapshot"),
            violation: "compare/domain/x.ts -> snapshot/domain/snapshot.ts",
        },
        {
            name: "snapshot → present",
            path: "snapshot/domain/x.ts",
            text: importsOf("../../present/domain/result"),
            violation: "snapshot/domain/x.ts -> present/domain/result.ts",
        },
        {
            name: "domain → an npm package, even type-only",
            path: "parse/domain/x.ts",
            text: 'import type { Parser } from "saxen";',
            violation: "parse/domain/x.ts -> saxen",
        },
    ])("flag $name and nothing else", ({ path, text, violation }) => {
        expect(violationsWith(path, text)).toEqual([violation]);
    });
});

describe("bpmn-diff architecture", () => {
    const graph = buildImportGraph(readSourceTree(SRC_ROOT));

    it("reads the domain entry as a pure module, the root entry not", () => {
        expect(
            ["@miragon/bpmn-modeler-diff/domain", "@miragon/bpmn-modeler-diff"].filter(
                IS_PURE_MODULE,
            ),
        ).toEqual(["@miragon/bpmn-modeler-diff/domain"]);
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
