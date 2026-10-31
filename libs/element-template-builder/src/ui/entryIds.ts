import type { Diagnostic } from "../domain/diagnostics";
import type { JsonPath } from "../domain/templateText";

export interface EntryDiagnostic {
    severity: Diagnostic["severity"];
    message: string;
}

const PREFIXES: Readonly<Record<string, string>> = { properties: "property", groups: "group" };

/**
 * The id of the entry that edits the value at `path`: the path's segments
 * joined by dashes, with list items named after their list.
 */
export function entryIdOf(path: JsonPath): string {
    if (path.length === 0) {
        return "";
    }
    const [first, ...rest] = path;
    const prefix = PREFIXES[first] ?? `template-${first}`;
    return [prefix, ...rest].join("-");
}

/**
 * Attaches each diagnostic to the nearest entry that shows its value, walking
 * up its path; what no entry shows is left for the summary.
 */
export function diagnosticsByEntry(
    diagnostics: readonly Diagnostic[],
    knownIds: ReadonlySet<string>,
): { byEntry: Record<string, EntryDiagnostic[]>; unplaced: Diagnostic[] } {
    const byEntry: Record<string, EntryDiagnostic[]> = {};
    const unplaced: Diagnostic[] = [];
    for (const diagnostic of diagnostics) {
        let path = diagnostic.path;
        while (path.length > 0 && !knownIds.has(entryIdOf(path))) {
            path = path.slice(0, -1);
        }
        if (path.length === 0) {
            unplaced.push(diagnostic);
            continue;
        }
        const id = entryIdOf(path);
        (byEntry[id] ??= []).push({ severity: diagnostic.severity, message: diagnostic.message });
    }
    return { byEntry, unplaced };
}
