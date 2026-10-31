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

/** The entry that stands for an object no single entry edits, such as a whole property. */
function standInOf(path: JsonPath): JsonPath | undefined {
    const [list, index, key] = path;
    if (typeof index !== "number" || (list !== "properties" && list !== "groups")) {
        return undefined;
    }
    if (path.length === 2) {
        return [list, index, list === "properties" ? "label" : "id"];
    }
    return path.length === 3 && key === "binding" ? [...path, "type"] : undefined;
}

/**
 * Attaches each diagnostic to the nearest entry that shows its value, walking
 * up its path; `entryIds` names that entry per diagnostic, or nothing when
 * only the summary can show it.
 */
export function diagnosticsByEntry(
    diagnostics: readonly Diagnostic[],
    knownIds: ReadonlySet<string>,
): { byEntry: Record<string, EntryDiagnostic[]>; entryIds: (string | undefined)[] } {
    const byEntry: Record<string, EntryDiagnostic[]> = {};
    const entryIds = diagnostics.map((diagnostic) => {
        const id = nearestEntry(diagnostic.path, knownIds);
        if (id) {
            (byEntry[id] ??= []).push({
                severity: diagnostic.severity,
                message: diagnostic.message,
            });
        }
        return id;
    });
    return { byEntry, entryIds };
}

function nearestEntry(path: JsonPath, knownIds: ReadonlySet<string>): string | undefined {
    for (let length = path.length; length > 0; length--) {
        const prefix = path.slice(0, length);
        const standIn = standInOf(prefix);
        for (const candidate of standIn ? [prefix, standIn] : [prefix]) {
            const id = entryIdOf(candidate);
            if (knownIds.has(id)) {
                return id;
            }
        }
    }
    return undefined;
}
