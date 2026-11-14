import { type ModdleParseResult, skippedContentWarning } from "./bpmnModdleFactory";
import { diagramLayouts } from "./diagramLayout";
import { createDocumentModdle } from "./documentModdle";
import {
    type UnitRule,
    isDiffUnit,
    isNameableElement,
    prefixSourcesWith,
    serialiseSnippet,
    snippetRootsOf,
    stripUnits,
    unitRuleRequiringId,
} from "./elementSnippets";
import { containmentProperties, walkContainment } from "./moddleContainment";
import { type ModdleElement, isModdleElement, isType } from "./moddleElement";

export interface ElementSnapshotOptions {
    /** Declarations that fix one prefix per namespace (default: the document itself), as for elementXml. */
    readonly prefixSources?: readonly string[];
    /**
     * Which semantic elements are units of their own (default: the diff's
     * rule, `trackedElementOf(element) === element`). Asked once per element,
     * before anything is stripped. An element without an id is never a unit.
     */
    readonly isUnit?: UnitRule;
    /** Rejects on any parse warning, such as an unresolved reference, not only on skipped content. */
    readonly rejectWarnings?: boolean;
}

export interface SnapshotReference {
    /** The referring element's type and property, for example `bpmn:SequenceFlow#sourceRef`. */
    readonly property: string;
    /** The unit that holds the referenced element. */
    readonly target: string;
    /** The referenced element's own id when it lies inside `target`. */
    readonly targetPart?: string;
}

export interface ElementSnapshot {
    readonly id: string;
    readonly type: string;
    /** The nearest enclosing unit, or the participant a process that is no unit is folded into. */
    readonly parent?: string;
    /** The object of the parent that holds the element, such as a lane set, when it has an id. */
    readonly container?: string;
    /** Every lane whose `flowNodeRef` lists the element, outermost first. */
    readonly lanes: readonly string[];
    /** Under the default unit rule, byte-identical to `elementXml`. */
    readonly xml: string;
    /** `xml` without the references the modeler derives: incoming, outgoing, flowNodeRef, boundaryEventRefs. */
    readonly content: string;
    /** Every reference of the unit's own subtree to another unit, derived ones left out. */
    readonly references: readonly SnapshotReference[];
    /** Ids of the elements inside the unit that are no units themselves, such as data inputs and event definitions. */
    readonly parts: readonly string[];
    /** Canonical text of the diagram elements that draw the unit; `undefined` when nothing does. */
    readonly layout?: string;
    /** The `bpmnElement` id of the plane holding the unit's first shape or edge; `undefined` when none does. */
    readonly plane?: string;
}

const DERIVED_REFERENCES = new Set([
    "bpmn:incoming",
    "bpmn:outgoing",
    "bpmn:flowNodeRef",
    "bpmn:boundaryEventRefs",
]);

/**
 * Parses `xml` once and returns a snapshot of every unit with an id, in
 * document order: its XML as `elementXml` writes it with the children that
 * are units of their own stripped, the same without derived references, and
 * its parent, container, lanes, references, parts and layout read from the
 * intact document. Rejects like `elementXml`, and on any parse warning with
 * `rejectWarnings`.
 */
export async function elementSnapshots(
    xml: string,
    {
        prefixSources = [xml],
        isUnit = isDiffUnit,
        rejectWarnings = false,
    }: ElementSnapshotOptions = {},
): Promise<ReadonlyMap<string, ElementSnapshot>> {
    const prefixedModdle = await createDocumentModdle(prefixSourcesWith(prefixSources, xml));
    const parsed = await prefixedModdle.moddle.fromXML(xml);
    const rejection = rejectionOf(parsed, rejectWarnings);
    if (rejection) throw new Error(`Failed to parse BPMN: ${rejection}`);
    const definitions = parsed.rootElement;

    const everyElement: ModdleElement[] = [];
    walkContainment(definitions, (element) => everyElement.push(element));
    const unitSet = new Set(everyElement.filter(unitRuleRequiringId(isUnit)));
    const isKnownUnit = (element: ModdleElement) => unitSet.has(element);
    const units = Object.values(parsed.elementsById).filter(
        (element): element is ModdleElement & { id: string } =>
            element !== undefined && unitSet.has(element),
    );
    const rootsByUnit = new Map(units.map((unit) => [unit, snippetRootsOf(unit, isKnownUnit)]));
    const unitBySnippetRoot = new Map<ModdleElement, ModdleElement>();
    for (const [unit, roots] of rootsByUnit)
        for (const root of roots) unitBySnippetRoot.set(root, unit);
    const owningUnitOf = (element: ModdleElement) => nearest(element, unitBySnippetRoot);

    const lanesByNode = lanesByFlowNode(everyElement);
    const layouts = diagramLayouts(definitions);
    const structure = new Map(
        units.map((unit) => {
            const holder = isModdleElement(unit.$parent) ? unit.$parent : undefined;
            const parent = holder && owningUnitOf(holder)?.id;
            return [
                unit,
                {
                    parent,
                    container:
                        parent !== undefined && holder && !unitBySnippetRoot.has(holder)
                            ? holder.id
                            : undefined,
                    lanes: lanesByNode.get(unit) ?? [],
                    references: referencesOf(
                        unit,
                        rootsByUnit.get(unit)!,
                        isKnownUnit,
                        owningUnitOf,
                    ),
                    layout: layouts.get(unit),
                },
            ];
        }),
    );

    stripUnits(
        everyElement.filter((element) => element !== definitions),
        isKnownUnit,
    );

    const snapshots = new Map<string, ElementSnapshot>();
    for (const unit of units) {
        const roots = rootsByUnit.get(unit)!;
        const parts = partsOf(unit, roots);
        const unitXml = await serialiseSnippet(prefixedModdle, roots, unit.id);
        for (const root of roots) walkContainment(root, deleteDerivedReferences);
        const content = await serialiseSnippet(prefixedModdle, roots, unit.id);
        const { parent, container, lanes, references, layout } = structure.get(unit)!;
        snapshots.set(unit.id, {
            id: unit.id,
            type: unit.$type,
            ...(parent === undefined ? {} : { parent }),
            ...(container === undefined ? {} : { container }),
            lanes,
            xml: unitXml,
            content,
            references,
            parts,
            ...(layout === undefined ? {} : { layout: layout.text }),
            ...(layout?.plane === undefined ? {} : { plane: layout.plane }),
        });
    }
    return snapshots;
}

function nearest(
    element: ModdleElement,
    unitBySnippetRoot: ReadonlyMap<ModdleElement, ModdleElement>,
): ModdleElement | undefined {
    for (let current: unknown = element; isModdleElement(current); current = current.$parent) {
        const unit = unitBySnippetRoot.get(current);
        if (unit) return unit;
    }
    return undefined;
}

function lanesByFlowNode(elements: readonly ModdleElement[]): Map<ModdleElement, string[]> {
    const lanesByNode = new Map<ModdleElement, string[]>();
    for (const lane of elements) {
        if (!isType(lane, "bpmn:Lane") || !lane.id || !Array.isArray(lane.flowNodeRef)) continue;
        for (const node of lane.flowNodeRef.filter(isModdleElement)) {
            lanesByNode.set(node, [...(lanesByNode.get(node) ?? []), lane.id]);
        }
    }
    return lanesByNode;
}

function referencesOf(
    unit: ModdleElement,
    roots: readonly ModdleElement[],
    isUnit: UnitRule,
    owningUnitOf: (element: ModdleElement) => ModdleElement | undefined,
): SnapshotReference[] {
    const references: SnapshotReference[] = [];
    const visit = (element: ModdleElement): void => {
        for (const property of element.$descriptor.properties ?? []) {
            if (!property.isReference || property.isVirtual || isDerived(property.ns?.name))
                continue;
            const value = element[property.name];
            for (const target of (Array.isArray(value) ? value : [value]).filter(isModdleElement)) {
                const targetUnit = owningUnitOf(target);
                if (!targetUnit?.id || targetUnit === unit) continue;
                references.push({
                    property: `${element.$type}#${property.name}`,
                    target: targetUnit.id,
                    ...(target === targetUnit || !target.id ? {} : { targetPart: target.id }),
                });
            }
        }
        for (const name of containmentProperties(element)) {
            const value = element[name];
            for (const child of (Array.isArray(value) ? value : [value]).filter(isModdleElement)) {
                if (!isUnit(child)) visit(child);
            }
        }
    };
    for (const root of roots) visit(root);
    return references;
}

function rejectionOf(parsed: ModdleParseResult, rejectWarnings: boolean): string | undefined {
    if (!rejectWarnings) return skippedContentWarning(parsed);
    const messages = (parsed.warnings ?? []).map(({ message }) => message ?? "unnamed warning");
    return messages.length > 0 ? messages.join("; ") : undefined;
}

/** Called once the units are stripped, so the walk stays inside the unit. */
function partsOf(unit: ModdleElement, roots: readonly ModdleElement[]): string[] {
    const parts: string[] = [];
    for (const root of roots) {
        walkContainment(root, (element) => {
            if (element !== unit && isNameableElement(element)) parts.push(element.id);
        });
    }
    return parts;
}

function isDerived(qualifiedName: string | undefined): boolean {
    return qualifiedName !== undefined && DERIVED_REFERENCES.has(qualifiedName);
}

function deleteDerivedReferences(element: ModdleElement): void {
    for (const property of element.$descriptor.properties ?? []) {
        if (isDerived(property.ns?.name)) delete element[property.name];
    }
}
