/**
 * Readonly derivation for the properties panel (issue #1441).
 *
 * A pure groups→groups transform applied by {@link PropertiesPanel} after the
 * providers have built their groups, whenever the modeler carries no `modeling`
 * service (a `NavigatedViewer`). Applying it in the component rather than as a
 * provider makes it deterministic — it always runs last, so it covers custom
 * and third-party groups too — and unit-testable without a live modeler.
 *
 * `@bpmn-io/properties-panel` primitives honour `entry.disabled` (text/select
 * inputs go readonly, FEEL/CodeMirror switch to readOnly), but the ListGroup
 * `add` button and per-item `remove` button are NOT gated by any entry flag, so
 * readonly mode must strip them outright.
 */

interface ReadonlyEntry {
    disabled?: boolean;
    [key: string]: unknown;
}

interface ReadonlyListItem {
    entries?: ReadonlyEntry[];
    remove?: unknown;
    [key: string]: unknown;
}

interface ReadonlyGroup {
    entries?: ReadonlyEntry[];
    items?: ReadonlyListItem[];
    add?: unknown;
    [key: string]: unknown;
}

function disableEntries(entries: ReadonlyEntry[] | undefined): void {
    if (!Array.isArray(entries)) {
        return;
    }
    for (const entry of entries) {
        if (entry) {
            entry.disabled = true;
        }
    }
}

/**
 * Mutates the given groups in place — every entry becomes `disabled`, and the
 * ListGroup `add` / item `remove` affordances are removed — then returns them.
 */
export function applyReadonly<T extends ReadonlyGroup>(groups: T[]): T[] {
    for (const group of groups) {
        if (!group) {
            continue;
        }

        // ListGroup add button is not covered by `disabled`.
        delete group.add;

        disableEntries(group.entries);

        if (Array.isArray(group.items)) {
            for (const item of group.items) {
                if (!item) {
                    continue;
                }
                // ListGroup item remove button is not covered by `disabled`.
                delete item.remove;
                disableEntries(item.entries);
            }
        }
    }

    return groups;
}
