import type { ArchitectureRule } from "./architectureRule";
import { isHostModule } from "./hostReach";
import type { ImportGraph } from "./importGraph";
import type { Violation } from "./knownExceptions";
import { isEntry, roleOf } from "./roleFolders";
import type { Role } from "./roleFolders";

type Place = Role | "entry";

interface PlacedImport {
    readonly from: string;
    readonly fromPlace: Place;
    readonly specifier: string;
    /** Set when the import resolves to a file of the tree. */
    readonly to?: string;
    /** Unset for a package or a file outside every role folder. */
    readonly toPlace?: Place;
}

const ADAPTERS: readonly Place[] = ["adapter/in", "adapter/out"];

function placeOf(path: string): Place | undefined {
    return isEntry(path) ? "entry" : roleOf(path)?.role;
}

/** An unplaced importer is reported once, by the placement rule, not for each import it makes. */
function placedImports(graph: ImportGraph): PlacedImport[] {
    return graph.edges.flatMap(({ from, specifier, to }) => {
        const fromPlace = placeOf(from);
        if (fromPlace === undefined) {
            return [];
        }
        const toPlace = to === undefined ? undefined : placeOf(to);
        return [{ from, fromPlace, specifier, to, toPlace }];
    });
}

function importsWhere(
    isBroken: (anImport: PlacedImport) => boolean,
): (graph: ImportGraph) => Violation[] {
    return (graph) =>
        placedImports(graph)
            .filter(isBroken)
            .map(({ from, specifier, to }) => ({ from, to: to ?? specifier }));
}

function isOneOf(place: Place | undefined, places: readonly Place[]): boolean {
    return place !== undefined && places.includes(place);
}

function unplacedFiles(graph: ImportGraph): Violation[] {
    return graph.files
        .filter((path) => placeOf(path) === undefined)
        .map((path) => ({ from: path, to: "(no role folder)" }));
}

export const HEXAGONAL_RULES: readonly ArchitectureRule[] = [
    {
        rule: "every file sits in a role folder or is an entry",
        violations: unplacedFiles,
    },
    {
        rule: "domain/ imports only domain/",
        violations: importsWhere(
            ({ fromPlace, to, toPlace }) =>
                fromPlace === "domain" && to !== undefined && toPlace !== "domain",
        ),
    },
    {
        rule: "port/ imports only domain/ and port/",
        violations: importsWhere(
            ({ fromPlace, to, toPlace }) =>
                fromPlace === "port" && to !== undefined && !isOneOf(toPlace, ["domain", "port"]),
        ),
    },
    {
        rule: "service/ imports no adapter/, composition/, testing/ or entry",
        violations: importsWhere(
            ({ fromPlace, toPlace }) =>
                fromPlace === "service" &&
                isOneOf(toPlace, [...ADAPTERS, "composition", "testing", "entry"]),
        ),
    },
    {
        rule: "only adapter/in/, service/, composition/, testing/ and entries import a service",
        violations: importsWhere(
            ({ fromPlace, toPlace }) =>
                toPlace === "service" &&
                !isOneOf(fromPlace, ["adapter/in", "service", "composition", "testing", "entry"]),
        ),
    },
    {
        rule: "adapter/in/ and adapter/out/ never import each other",
        violations: importsWhere(
            ({ fromPlace, toPlace }) =>
                isOneOf(fromPlace, ADAPTERS) && isOneOf(toPlace, ADAPTERS) && fromPlace !== toPlace,
        ),
    },
    {
        rule: "only adapter/, composition/ and entries import a host module",
        violations: importsWhere(
            ({ fromPlace, specifier }) =>
                isHostModule(specifier) &&
                !isOneOf(fromPlace, [...ADAPTERS, "composition", "entry"]),
        ),
    },
    {
        rule: "only composition/ and entries import composition/",
        violations: importsWhere(
            ({ fromPlace, toPlace }) =>
                toPlace === "composition" && !isOneOf(fromPlace, ["composition", "entry"]),
        ),
    },
    {
        rule: "only testing/ imports testing/",
        violations: importsWhere(
            ({ fromPlace, toPlace }) => toPlace === "testing" && fromPlace !== "testing",
        ),
    },
    {
        rule: "nothing imports an entry",
        violations: importsWhere(({ toPlace }) => toPlace === "entry"),
    },
];
