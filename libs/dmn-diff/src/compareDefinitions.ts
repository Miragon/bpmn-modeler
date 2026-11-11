import { compareTable } from "./compareTable";
import type { DecisionTableChanges, DmnDiffResult } from "./dmnDiffResult";
import { many, one, type ModdleElement } from "./moddleElement";
import { canonical, signature, type PropertyOverride } from "./signature";

const REQUIREMENTS = [
    "informationRequirement",
    "knowledgeRequirement",
    "authorityRequirement",
] as const;

const DECISION_TABLE = "dmn:DecisionTable";

/**
 * Requirements are compared as elements of their own. A decision table counts
 * by its type only; {@link compareTable} compares its content.
 */
const OWN_CONTENT: Readonly<Record<string, PropertyOverride>> = {
    ...Object.fromEntries(REQUIREMENTS.map((name) => [name, () => undefined])),
    decisionLogic: (logic) =>
        (logic as ModdleElement).$type === DECISION_TABLE ? DECISION_TABLE : canonical(logic),
};

interface Position {
    readonly x: number;
    readonly y: number;
}

interface DrdElement {
    readonly element: ModdleElement;
    readonly signature: string;
    readonly order: number;
}

interface Layout {
    readonly signature: string;
    readonly position: Position;
}

/** Compares two parsed `dmn:Definitions` trees. */
export function compareDefinitions(before: ModdleElement, after: ModdleElement): DmnDiffResult {
    const from = drdElements(before);
    const to = drdElements(after);
    const fromLayout = layouts(before);
    const toLayout = layouts(after);

    const tables: Record<string, DecisionTableChanges> = {};
    const expressions: string[] = [];
    const added: string[] = [];
    const changed: string[] = [];
    const layoutChanged: string[] = [];
    for (const [id, current] of to) {
        const previous = from.get(id);
        if (!previous) {
            added.push(id);
            continue;
        }
        const table = tableChanges(previous.element, current.element);
        if (table) tables[id] = table;
        if (expressionChanged(previous.element, current.element)) expressions.push(id);
        if (table || previous.signature !== current.signature) changed.push(id);
        if (fromLayout.get(id)?.signature !== toLayout.get(id)?.signature) layoutChanged.push(id);
    }
    const removed = [...from.keys()].filter((id) => !to.has(id));

    const sortKey = (id: string) => {
        const isRemoved = !to.has(id);
        const position = (isRemoved ? fromLayout : toLayout).get(id)?.position;
        const order = (isRemoved ? from : to).get(id)?.order ?? 0;
        return { position, order };
    };
    const inReadingOrder = (ids: readonly string[]) =>
        [...ids].sort((a, b) => compareReadingOrder(sortKey(a), sortKey(b)));

    const result = {
        added: inReadingOrder(added),
        removed: inReadingOrder(removed),
        changed: inReadingOrder(changed),
        layoutChanged: inReadingOrder(layoutChanged),
    };
    return {
        ...result,
        counts: {
            added: added.length,
            removed: removed.length,
            changed: changed.length,
            layoutChanged: layoutChanged.length,
        },
        navigationOrder: inReadingOrder([
            ...new Set([...added, ...removed, ...changed, ...layoutChanged]),
        ]),
        tables,
        expressions: inReadingOrder(expressions),
    };
}

/** Top to bottom, then left to right; elements without a shape or edge come last, in document order. */
function compareReadingOrder(
    a: { position?: Position; order: number },
    b: { position?: Position; order: number },
): number {
    if (a.position && b.position) {
        return a.position.y - b.position.y || a.position.x - b.position.x || a.order - b.order;
    }
    if (a.position) return -1;
    if (b.position) return 1;
    return a.order - b.order;
}

function drdElements(definitions: ModdleElement): Map<string, DrdElement> {
    const elements = new Map<string, DrdElement>();
    const add = (element: ModdleElement, value: string) => {
        if (element.id)
            elements.set(element.id, { element, signature: value, order: elements.size });
    };
    for (const element of many(definitions, "drgElement")) {
        add(element, signature(element, OWN_CONTENT));
        for (const name of REQUIREMENTS) {
            for (const requirement of many(element, name)) {
                add(requirement, `${element.id ?? ""}${signature(requirement)}`);
            }
        }
    }
    for (const artifact of many(definitions, "artifact")) add(artifact, signature(artifact));
    return elements;
}

function layouts(definitions: ModdleElement): Map<string, Layout> {
    const result = new Map<string, Layout>();
    for (const diagram of many(one(definitions, "dmnDI"), "diagrams")) {
        for (const shapeOrEdge of many(diagram, "diagramElements")) {
            const id = one(shapeOrEdge, "dmnElementRef")?.id;
            const layout = layoutOf(shapeOrEdge);
            if (id && layout) result.set(id, layout);
        }
    }
    return result;
}

function layoutOf(shapeOrEdge: ModdleElement): Layout | undefined {
    const bounds = one(shapeOrEdge, "bounds");
    if (bounds) {
        const [x, y, width, height] = ["x", "y", "width", "height"].map((name) =>
            Number(bounds[name]),
        );
        return { signature: `shape:${x},${y},${width},${height}`, position: { x, y } };
    }
    const points = many(shapeOrEdge, "waypoint").map((point) => ({
        x: Number(point.x),
        y: Number(point.y),
    }));
    if (points.length === 0) return undefined;
    const first = points[0];
    const last = points[points.length - 1];
    return {
        signature: `edge:${points.map((point) => `${point.x},${point.y}`).join(";")}`,
        position: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 },
    };
}

function tableChanges(
    before: ModdleElement,
    after: ModdleElement,
): DecisionTableChanges | undefined {
    const from = one(before, "decisionLogic");
    const to = one(after, "decisionLogic");
    if (from?.$type !== DECISION_TABLE || to?.$type !== DECISION_TABLE) return undefined;
    return compareTable(from, to);
}

function expressionChanged(before: ModdleElement, after: ModdleElement): boolean {
    const property =
        before.$type === "dmn:BusinessKnowledgeModel" ? "encapsulatedLogic" : "decisionLogic";
    const from = one(before, property);
    const to = one(after, property);
    if (!from || !to || from.$type === DECISION_TABLE || to.$type === DECISION_TABLE) return false;
    return signature(from) !== signature(to);
}
