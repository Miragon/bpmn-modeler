import {
    type ModdleElement,
    containmentProperties,
    isModdleElement,
    isType,
} from "@miragon/bpmn-modeler-diff";

import { isMergeElement } from "./mergeElements";
import { orderMembers } from "./mergedTreeOrder";
import { MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";

type ItemKey = string | ModdleElement;

interface PathStep {
    readonly property: string;
    readonly key: string;
    readonly isMany: boolean;
    readonly element: ModdleElement;
}

/** Where a unit sits: a collection reached from its owning unit (the definitions when none) through elements that are no units. */
interface UnitPlacement {
    readonly owner?: string;
    readonly path: readonly PathStep[];
    readonly property: string;
}

/** One version's semantic tree with every unit cut out of its collections, and where each unit sat. */
export interface VersionTree {
    readonly definitions: ModdleElement;
    readonly units: ReadonlyMap<string, ModdleElement>;
    readonly placements: ReadonlyMap<string, UnitPlacement>;
    /** Per collection, its items in document order: units by id, other elements by id or by identity. */
    readonly orders: ReadonlyMap<string, readonly ItemKey[]>;
}

function isUnitElement(element: ModdleElement): element is ModdleElement & { id: string } {
    return (
        isType(element, "bpmn:BaseElement") &&
        !isType(element, "bpmn:Definitions") &&
        typeof element.id === "string" &&
        isMergeElement(element)
    );
}

/** Takes the parsed tree apart in place: the definitions keep only what is no unit, and each unit only its own content. */
export function versionTreeOf(definitions: ModdleElement): VersionTree {
    const units = new Map<string, ModdleElement>();
    const placements = new Map<string, UnitPlacement>();
    const orders = new Map<string, ItemKey[]>();
    const visit = (element: ModdleElement, owner: string | undefined, path: PathStep[]): void => {
        for (const property of containmentProperties(element)) {
            if (element === definitions && property === "diagrams") continue;
            const value = element[property];
            if (Array.isArray(value)) {
                const order: ItemKey[] = [];
                value.forEach((child: unknown, index) => {
                    if (!isModdleElement(child)) return;
                    if (isUnitElement(child)) {
                        units.set(child.id, child);
                        placements.set(child.id, { owner, path, property });
                        order.push(child.id);
                        visit(child, child.id, []);
                    } else {
                        order.push(itemKeyOf(child));
                        const step = {
                            property,
                            key: stepKeyOf(child, index),
                            isMany: true,
                            element: child,
                        };
                        visit(child, owner, [...path, step]);
                    }
                });
                orders.set(slotKeyOf({ owner, path, property }), order);
                const kept = value.filter(
                    (child) => !(isModdleElement(child) && isUnitElement(child)),
                );
                if (kept.length !== value.length) element[property] = kept;
            } else if (isModdleElement(value)) {
                const step = { property, key: stepKeyOf(value, 0), isMany: false, element: value };
                visit(value, owner, [...path, step]);
            }
        }
    };
    visit(definitions, undefined, []);
    return { definitions, units, placements, orders };
}

/** Every element whose presence in a version differs from what the merge result says of that version. */
export function requireDecidedElements(
    result: MergeResult,
    trees: Readonly<Record<MergeSide, VersionTree>>,
): void {
    const decidedIds = new Set(result.elements.map(({ id }) => id));
    const mismatches = MERGE_SIDES.flatMap((side) => [
        ...result.elements
            .filter(
                ({ id, versions }) => (versions[side] !== undefined) !== trees[side].units.has(id),
            )
            .map(({ id }) => `${id} (${side})`),
        ...[...trees[side].units.keys()]
            .filter((id) => !decidedIds.has(id))
            .map((id) => `${id} (${side})`),
    ]);
    if (mismatches.length > 0) {
        throw new Error(
            `The merge decisions were made for other versions: ${[...new Set(mismatches)].join(", ")}`,
        );
    }
}

/**
 * Puts each element of the result, as its side wrote it, into the collection
 * its side puts it in, inside the result's own element of that owner. Current's
 * definitions are the frame. Returns the result's units by id.
 */
export function assembleSemanticTree(
    trees: Readonly<Record<MergeSide, VersionTree>>,
    sides: Readonly<Record<string, MergeSide>>,
): Map<string, ModdleElement> {
    const resultUnits = new Map<string, ModdleElement>();
    for (const [id, side] of Object.entries(sides)) {
        const unit = trees[side].units.get(id);
        if (unit) resultUnits.set(id, unit);
    }
    const slots = new Map<
        string,
        { container: ModdleElement; property: string; members: Map<ItemKey, ModdleElement> }
    >();
    for (const [id, unit] of resultUnits) {
        const placement = trees[sides[id]!].placements.get(id)!;
        const owner =
            placement.owner === undefined
                ? trees.current.definitions
                : resultUnits.get(placement.owner);
        if (!owner) {
            throw new Error(`The merged BPMN has no ${placement.owner} to hold ${id}`);
        }
        const container = placement.path.reduce(intermediateIn, owner);
        const slotKey = slotKeyOf(placement);
        let slot = slots.get(slotKey);
        if (!slot) {
            const items = (container[placement.property] as unknown[] | undefined) ?? [];
            const members = new Map<ItemKey, ModdleElement>(
                items.filter(isModdleElement).map((item) => [itemKeyOf(item), item]),
            );
            slot = { container, property: placement.property, members };
            slots.set(slotKey, slot);
        }
        slot.members.set(id, unit);
    }
    for (const [slotKey, { container, property, members }] of slots) {
        const order = orderMembers(
            trees.current.orders.get(slotKey) ?? [],
            trees.incoming.orders.get(slotKey) ?? [],
            new Set(members.keys()),
        );
        container[property] = order.map((key) => {
            const member = members.get(key)!;
            member.$parent = container;
            return member;
        });
    }
    return resultUnits;
}

/** The result's element at this step, or the side's own one moved in when the result's owner lacks it. */
function intermediateIn(container: ModdleElement, step: PathStep): ModdleElement {
    const value = container[step.property];
    const candidates = Array.isArray(value) ? value : [value];
    const found = candidates.find(
        (candidate, index): candidate is ModdleElement =>
            isModdleElement(candidate) && stepKeyOf(candidate, index) === step.key,
    );
    if (found) return found;
    if (step.isMany)
        container[step.property] = [...(Array.isArray(value) ? value : []), step.element];
    else container[step.property] = step.element;
    step.element.$parent = container;
    return step.element;
}

function slotKeyOf({ owner, path, property }: UnitPlacement): string {
    return JSON.stringify([owner ?? null, path.map((step) => [step.property, step.key]), property]);
}

function stepKeyOf(element: ModdleElement, index: number): string {
    return element.id ?? `${element.$type}#${index}`;
}

function itemKeyOf(element: ModdleElement): ItemKey {
    return element.id ?? element;
}
