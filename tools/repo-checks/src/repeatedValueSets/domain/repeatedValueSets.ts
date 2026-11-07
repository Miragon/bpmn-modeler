import { compareText, type Finding, sortFindings } from "../../fitness/domain/finding";

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
// Specs and fixtures are inputs of tests; a declaration file repeats third-party typings per workspace;
// a build config is configuration, as change coupling treats it.
const UNREAD_SCRIPT_FILE =
    /\.(spec|test)\.[^/]+$|(^|\/)__fixtures__\/|\.d\.[mc]?ts$|(^|\/)[^/]*\.config\.[^/]+$/;
const MIN_DISTINCT_VALUES = 2;
const MIN_FILE_GROUPS = 2;

export function isValueSetSource(path: string): boolean {
    return SCRIPT_FILE.test(path) && !UNREAD_SCRIPT_FILE.test(path);
}

function canonicalValues(values: readonly string[]): string[] {
    return [...new Set(values)].sort(compareText);
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
                message: `${valueList}, also at ${sorted
                    .filter((other) => other !== occurrence)
                    .map(location)
                    .join(", ")}`,
            }));
        },
    );
    return sortFindings(findings);
}
