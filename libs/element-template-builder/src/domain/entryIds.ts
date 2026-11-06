import { BUILDER_TABS, type BuilderTab, type ItemTab } from "./builderNavigation";
import type { Diagnostic } from "./diagnostics";
import type { JsonPath } from "./templateText";

export interface EntryDiagnostic {
    severity: Diagnostic["severity"];
    message: string;
}

/** The word every entry id on a tab starts with; a list's tab is named after the list. */
const TAB_PREFIXES: Readonly<Record<BuilderTab, string>> = {
    template: "template",
    groups: "group",
    properties: "property",
};

function isItemTab(key: string | number): key is ItemTab {
    return key !== "template" && Object.prototype.hasOwnProperty.call(TAB_PREFIXES, key);
}

/**
 * The id of the entry that edits the value at `path`: the path's segments
 * joined by dashes, with list items named after their list.
 */
export function entryIdOf(path: JsonPath): string {
    if (path.length === 0) {
        return "";
    }
    const [first, ...rest] = path;
    const prefix = isItemTab(first) ? TAB_PREFIXES[first] : `${TAB_PREFIXES.template}-${first}`;
    return [prefix, ...rest].join("-");
}

/** Where the form shows an entry: its tab and, on a list's tab, the item. */
export type EntryTarget = { tab: "template" } | { tab: ItemTab; index: number };

export function entryTarget(entryId: string): EntryTarget {
    const [prefix, index] = entryId.split("-");
    const tab = BUILDER_TABS.find(
        (candidate): candidate is ItemTab =>
            isItemTab(candidate) && TAB_PREFIXES[candidate] === prefix,
    );
    return tab ? { tab, index: Number(index) } : { tab: "template" };
}

/** The start of every entry id on `tab` or, given an `index`, of that item's entries. */
export function entryPrefix(tab: BuilderTab): string;
export function entryPrefix(tab: ItemTab, index: number): string;
export function entryPrefix(tab: BuilderTab, index?: number): string {
    const prefix = `${TAB_PREFIXES[tab]}-`;
    return index === undefined ? prefix : `${prefix}${index}-`;
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
