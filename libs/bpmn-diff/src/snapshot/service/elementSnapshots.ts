import {
    type ModdleParseResult,
    parseWarningMessages,
    skippedContentWarning,
} from "../../moddle/domain/bpmnModdleFactory";
import { type ModdleElement, isModdleElement, isType } from "../../moddle/domain/moddleElement";
import { ownAttributeEntries } from "../../parse/domain/moddleContainment";
import { diagramLayouts } from "../domain/diagramLayout";
import type { ElementSnapshot } from "../domain/elementSnapshot";
import { type UnitRule, isDiffUnit, snippetRootsOf } from "../domain/elementSnippets";
import { unitParts, unitReferences } from "../domain/unitStructure";
import { parsedUnitsOf, stripEveryUnit, unitContentOf } from "./parsedUnits";
import { serialiseSnippet } from "./serialiseSnippet";

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
    const parsedUnits = await parsedUnitsOf(xml, prefixSources, isUnit, (parsed) =>
        rejectionOf(parsed, rejectWarnings),
    );
    const { prefixedModdle, parsed, everyElement, units, isKnownUnit } = parsedUnits;
    const definitions = parsed.rootElement;
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
                    references: unitReferences(
                        unit,
                        rootsByUnit.get(unit)!,
                        isKnownUnit,
                        (target) => owningUnitOf(target)?.id,
                    ),
                    layout: layouts.get(unit),
                },
            ];
        }),
    );

    stripEveryUnit(parsedUnits);

    const snapshots = new Map<string, ElementSnapshot>();
    for (const unit of units) {
        const roots = rootsByUnit.get(unit)!;
        const parts = unitParts(unit, roots);
        const unitXml = await serialiseSnippet(prefixedModdle, roots, unit.id);
        const content = await unitContentOf(prefixedModdle, roots, unit.id);
        const { parent, container, lanes, references, layout } = structure.get(unit)!;
        snapshots.set(unit.id, {
            id: unit.id,
            type: unit.$type,
            ...(parent === undefined ? {} : { parent }),
            ...(container === undefined ? {} : { container }),
            lanes,
            xml: unitXml,
            content,
            attributes: attributesOf(unit),
            references,
            parts,
            ...(layout === undefined ? {} : { layout: layout.text }),
            ...(layout?.plane === undefined ? {} : { plane: layout.plane }),
            ...(layout?.place === undefined ? {} : { place: layout.place }),
        });
    }
    return snapshots;
}

function attributesOf(unit: ModdleElement): Record<string, string> {
    const attributes: Record<string, string> = {};
    for (const { name, value } of ownAttributeEntries(unit)) attributes[name] = value;
    return attributes;
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

function rejectionOf(parsed: ModdleParseResult, rejectWarnings: boolean): string | undefined {
    if (!rejectWarnings) return skippedContentWarning(parsed);
    const messages = parseWarningMessages(parsed.warnings);
    return messages.length > 0 ? messages.join("; ") : undefined;
}
