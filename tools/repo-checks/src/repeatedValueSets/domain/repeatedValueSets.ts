import { compareText, type Finding, sortFindings } from "../../fitness/domain/finding";
import { TEST_FOLDERS } from "../../sourceFiles/domain/sourceFiles";

export interface ValueSetOccurrence {
    /** POSIX path relative to the repo root. */
    readonly path: string;
    readonly line: number;
    readonly values: readonly string[];
}

/** A type equality assertion that holds a declaration of `path` equal to one of `pinnedPath`. */
export interface FilePin {
    readonly path: string;
    readonly pinnedPath: string;
}

export interface ValueSetInventory {
    readonly occurrences: readonly ValueSetOccurrence[];
    readonly pins: readonly FilePin[];
}

interface ValueSet {
    readonly values: readonly string[];
    readonly occurrences: ValueSetOccurrence[];
}

const SCRIPT_FILE = /\.([mc]?[jt]s|[jt]sx)$/;
// Specs and test folders are tests and their inputs; a declaration file repeats third-party typings
// per workspace; a build config is configuration, as change coupling treats it.
const UNREAD_SCRIPT_FILE = /\.(spec|test)\.[^/]+$|\.d\.[mc]?ts$|(^|\/)[^/]*\.config\.[^/]+$/;
const MIN_DISTINCT_VALUES = 2;
const MIN_FILE_GROUPS = 2;
const TYPE_PIN_REMEDY =
    "pin the copy to the home's type, and derive it from the home only where the order is the same concern";

export function isValueSetSource(path: string): boolean {
    const folders = path.split("/").slice(0, -1);
    return (
        SCRIPT_FILE.test(path) &&
        !UNREAD_SCRIPT_FILE.test(path) &&
        !folders.some((folder) => TEST_FOLDERS.has(folder))
    );
}

function canonicalValues(values: readonly string[]): string[] {
    return [...new Set(values)].sort(compareText);
}

function writtenOrder(values: readonly string[]): string {
    return JSON.stringify([...new Set(values)]);
}

function compareOccurrences(left: ValueSetOccurrence, right: ValueSetOccurrence): number {
    return compareText(left.path, right.path) || left.line - right.line;
}

function location({ path, line }: ValueSetOccurrence): string {
    return `\`${path}:${line}\``;
}

function setsByKey(occurrences: readonly ValueSetOccurrence[]): Map<string, ValueSet> {
    const sets = new Map<string, ValueSet>();
    for (const occurrence of occurrences) {
        const values = canonicalValues(occurrence.values);
        if (values.length >= MIN_DISTINCT_VALUES) {
            const setKey = JSON.stringify(values);
            const set = sets.get(setKey) ?? { values, occurrences: [] };
            set.occurrences.push(occurrence);
            sets.set(setKey, set);
        }
    }
    return sets;
}

// Only pins between files that both hold the set link them: a third file may declare another type.
function fileGroupOf(
    occurrences: readonly ValueSetOccurrence[],
    pins: readonly FilePin[],
): (path: string) => string {
    const linkedPath = new Map(occurrences.map(({ path }) => [path, path]));
    const groupOf = (path: string): string => {
        const linked = linkedPath.get(path) ?? path;
        return linked === path ? path : groupOf(linked);
    };
    for (const { path, pinnedPath } of pins) {
        if (linkedPath.has(path) && linkedPath.has(pinnedPath)) {
            linkedPath.set(groupOf(path), groupOf(pinnedPath));
        }
    }
    return groupOf;
}

// One finding per occurrence, keyed without its line: an added copy is new while the others stay existing.
export function repeatedValueSetFindings({ occurrences, pins }: ValueSetInventory): Finding[] {
    const findings = [...setsByKey(occurrences)].flatMap(
        ([setKey, { values, occurrences: sameSet }]) => {
            const groupOf = fileGroupOf(sameSet, pins);
            if (new Set(sameSet.map(({ path }) => groupOf(path))).size < MIN_FILE_GROUPS) {
                return [];
            }
            const sorted = [...sameSet].sort(compareOccurrences);
            const valueList = values.map((value) => `\`${value}\``).join(" · ");
            return sorted.map((occurrence): Finding => ({
                key: `${occurrence.path} — ${setKey}`,
                path: occurrence.path,
                paths: [occurrence.path],
                line: occurrence.line,
                message: `${valueList}, also at ${othersText(occurrence, sorted)}`,
            }));
        },
    );
    return sortFindings(findings);
}

// Deriving a copy from its home (reversed, sorted) ties its order to the home's; a pin keeps it its own.
function othersText(
    occurrence: ValueSetOccurrence,
    sameSet: readonly ValueSetOccurrence[],
): string {
    const others = sameSet.filter((other) => other !== occurrence);
    const order = writtenOrder(occurrence.values);
    const reordered = others.filter((other) => writtenOrder(other.values) !== order);
    const othersList = others.map(location).join(", ");
    return reordered.length === 0
        ? othersList
        : `${othersList}; in another order at ${reordered.map(location).join(", ")}: ${TYPE_PIN_REMEDY}`;
}
