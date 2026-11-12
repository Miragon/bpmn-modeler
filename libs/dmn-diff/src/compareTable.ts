import type { DecisionTableChanges } from "./dmnDiffResult";
import { idsOf, many, type ModdleElement } from "./moddleElement";
import { movedIds } from "./ruleOrder";
import { propertySignatures, signature } from "./signature";

const CONTENT = ["input", "output", "rule", "annotation"] as const;
const TABLE_CONTENT = Object.fromEntries(CONTENT.map((name) => [name, () => undefined]));
const RULE_CONTENT = Object.fromEntries(
    ["inputEntry", "outputEntry", "annotationEntry", "description"].map((name) => [
        name,
        () => undefined,
    ]),
);

/**
 * The changes between two versions of one decision table, or `undefined` when
 * the tables say the same. Entries are matched to their column by position, as
 * DMN pairs them, and compared column by column, so a column that is added,
 * removed or reordered changes no cell.
 */
export function compareTable(
    before: ModdleElement,
    after: ModdleElement,
): DecisionTableChanges | undefined {
    const columns = compareColumns(before, after);
    const rules = compareRules(before, after);
    const properties = changedProperties(before, after);

    const isEmpty =
        [
            columns.added,
            columns.removed,
            columns.changed,
            rules.added,
            rules.removed,
            rules.changed,
            rules.moved,
        ].every((ids) => ids.length === 0) && properties.length === 0;
    if (isEmpty) return undefined;

    const attributesStep = properties.length > 0 && after.id ? after.id : undefined;
    return {
        columns,
        rules: {
            added: rules.added,
            removed: rules.removed,
            changed: rules.changed,
            moved: rules.moved,
        },
        cells: rules.cells,
        annotations: rules.annotations,
        properties,
        counts: {
            added: columns.added.length + rules.added.length,
            removed: columns.removed.length + rules.removed.length,
            changed:
                columns.changed.length + rules.changed.length + (properties.length > 0 ? 1 : 0),
            layoutChanged: rules.moved.length,
        },
        ...(attributesStep === undefined ? {} : { attributesStep }),
        navigationOrder: navigationOrder(before, after, columns, rules, attributesStep),
    };
}

function columnsOf(table: ModdleElement): ModdleElement[] {
    return [...many(table, "input"), ...many(table, "output")];
}

function compareColumns(
    before: ModdleElement,
    after: ModdleElement,
): DecisionTableChanges["columns"] {
    return compareById(columnsOf(before), columnsOf(after));
}

function compareById(
    before: readonly ModdleElement[],
    after: readonly ModdleElement[],
): { added: string[]; removed: string[]; changed: string[] } {
    const beforeById = new Map(before.map((element) => [element.id, element]));
    const afterIds = new Set(idsOf(after));
    return {
        added: idsOf(after.filter((element) => !beforeById.has(element.id))),
        removed: idsOf(before.filter((element) => !afterIds.has(element.id ?? ""))),
        changed: idsOf(
            after.filter((element) => {
                const previous = beforeById.get(element.id);
                return previous !== undefined && signature(previous) !== signature(element);
            }),
        ),
    };
}

interface RuleChanges {
    added: string[];
    removed: string[];
    changed: string[];
    moved: string[];
    cells: string[];
    annotations: string[];
}

function compareRules(before: ModdleElement, after: ModdleElement): RuleChanges {
    const beforeRules = many(before, "rule");
    const afterRules = many(after, "rule");
    const beforeById = new Map(beforeRules.map((rule) => [rule.id, rule]));
    const afterIds = new Set(idsOf(afterRules));
    const changes: RuleChanges = {
        added: idsOf(afterRules.filter((rule) => !beforeById.has(rule.id))),
        removed: idsOf(beforeRules.filter((rule) => !afterIds.has(rule.id ?? ""))),
        changed: [],
        moved: movedIds(idsOf(beforeRules), idsOf(afterRules)),
        cells: [],
        annotations: [],
    };

    const pairs = [
        { entries: "inputEntry", from: many(before, "input"), to: many(after, "input") },
        { entries: "outputEntry", from: many(before, "output"), to: many(after, "output") },
    ];
    for (const rule of afterRules) {
        const previous = beforeById.get(rule.id);
        if (!previous?.id) continue;
        const cells = pairs.flatMap(({ entries, from, to }) =>
            changedEntries(previous, rule, entries, from, to),
        );
        const annotationChanged =
            previous.description !== rule.description ||
            annotationsOf(previous) !== annotationsOf(rule);
        const otherChanged = signature(previous, RULE_CONTENT) !== signature(rule, RULE_CONTENT);
        changes.cells.push(...cells);
        if (annotationChanged) changes.annotations.push(previous.id);
        if (cells.length > 0 || annotationChanged || otherChanged)
            changes.changed.push(previous.id);
    }
    return changes;
}

function annotationsOf(rule: ModdleElement): string {
    return JSON.stringify(many(rule, "annotationEntry").map((entry) => signature(entry)));
}

/** Ids of the entries of one rule whose expression changed, after id first. */
function changedEntries(
    previous: ModdleElement,
    rule: ModdleElement,
    entries: string,
    beforeColumns: readonly ModdleElement[],
    afterColumns: readonly ModdleElement[],
): string[] {
    const beforeIndex = new Map(beforeColumns.map((column, index) => [column.id, index]));
    const beforeEntries = many(previous, entries);
    const afterEntries = many(rule, entries);
    return afterColumns.flatMap((column, index) => {
        const oldIndex = beforeIndex.get(column.id);
        if (oldIndex === undefined) return [];
        const oldEntry = beforeEntries[oldIndex];
        const newEntry = afterEntries[index];
        if (signature(oldEntry) === signature(newEntry)) return [];
        return [...new Set(idsOf([newEntry, oldEntry].filter((entry) => entry !== undefined)))];
    });
}

function changedProperties(before: ModdleElement, after: ModdleElement): string[] {
    const from = propertySignatures(before, TABLE_CONTENT);
    const to = propertySignatures(after, TABLE_CONTENT);
    return [...new Set([...from.keys(), ...to.keys()])]
        .filter((name) => name !== "$type" && from.get(name) !== to.get(name))
        .map((name) => name.replace(/^@/, ""))
        .sort();
}

/**
 * The attributes step first, then columns, then rules; a removed column or rule
 * takes the place after the neighbour it followed in the before version.
 */
function navigationOrder(
    before: ModdleElement,
    after: ModdleElement,
    columns: DecisionTableChanges["columns"],
    rules: RuleChanges,
    attributesStep: string | undefined,
): string[] {
    const columnSlots = slots(idsOf(columnsOf(before)), idsOf(columnsOf(after)), 0);
    const ruleSlots = slots(
        idsOf(many(before, "rule")),
        idsOf(many(after, "rule")),
        columnSlots.size + 1,
    );
    const changedColumns = new Set([...columns.changed, ...columns.added, ...columns.removed]);
    const changedRules = new Set([
        ...rules.changed,
        ...rules.added,
        ...rules.removed,
        ...rules.moved,
    ]);
    const steps: Array<[string, number]> = [
        ...(attributesStep === undefined ? [] : [[attributesStep, -1] as [string, number]]),
        ...[...columnSlots].filter(([id]) => changedColumns.has(id)),
        ...[...ruleSlots].filter(([id]) => changedRules.has(id)),
    ];
    return steps.sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

/**
 * A position for every id of both orders: an id the after version has takes
 * its index there; a removed id sits just after the shared id it followed, and
 * several removed ids in a row keep their order.
 */
function slots(
    before: readonly string[],
    after: readonly string[],
    offset: number,
): Map<string, number> {
    const kept = new Map(after.map((id, index) => [id, offset + index]));
    const result = new Map(kept);
    let anchor = offset - 1;
    let gap = 0;
    for (const id of before) {
        const slot = kept.get(id);
        if (slot === undefined) {
            gap += 1;
            result.set(id, anchor + gap / (before.length + 1));
        } else {
            anchor = slot;
            gap = 0;
        }
    }
    return result;
}
