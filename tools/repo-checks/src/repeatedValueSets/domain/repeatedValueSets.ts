import { compareText, type Finding, sortFindings } from "../../fitness/domain/finding";

export interface ValueSetOccurrence {
    /** POSIX path relative to the repo root. */
    readonly path: string;
    readonly line: number;
    readonly values: readonly string[];
}

const SCRIPT_FILE = /\.([mc]?[jt]s|[jt]sx)$/;
// A declaration file repeats third-party typings per workspace; a build config is configuration, as change coupling treats it.
const UNREAD_SCRIPT_FILE = /\.(spec|test)\.[^/]+$|\.d\.[mc]?ts$|(^|\/)[^/]*\.config\.[^/]+$/;
const MIN_DISTINCT_VALUES = 2;
const MIN_FILES = 2;

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

// One finding per occurrence, keyed without its line: an added copy is new while the others stay existing.
export function repeatedValueSetFindings(occurrences: readonly ValueSetOccurrence[]): Finding[] {
    const setsByKey = new Map<string, { values: string[]; occurrences: ValueSetOccurrence[] }>();
    for (const occurrence of occurrences) {
        const values = canonicalValues(occurrence.values);
        if (values.length >= MIN_DISTINCT_VALUES) {
            const setKey = JSON.stringify(values);
            const set = setsByKey.get(setKey) ?? { values, occurrences: [] };
            set.occurrences.push(occurrence);
            setsByKey.set(setKey, set);
        }
    }
    const findings = [...setsByKey]
        .filter(([, set]) => new Set(set.occurrences.map(({ path }) => path)).size >= MIN_FILES)
        .flatMap(([setKey, { values, occurrences: sameSet }]) => {
            const sorted = [...sameSet].sort(compareOccurrences);
            const valueList = values.map((value) => `\`${value}\``).join(" · ");
            return sorted.map((occurrence): Finding => ({
                key: `${occurrence.path} — ${setKey}`,
                path: occurrence.path,
                line: occurrence.line,
                message: `${valueList}, also at ${sorted
                    .filter((other) => other !== occurrence)
                    .map(location)
                    .join(", ")}`,
            }));
        });
    return sortFindings(findings);
}
