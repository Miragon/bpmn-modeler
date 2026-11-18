import { type ModdleReference, skippedContentWarning } from "./bpmnModdleFactory";
import { createDocumentModdle } from "./documentModdle";
import {
    type UnitRule,
    deleteDerivedReferences,
    isDiffUnit,
    prefixSourcesWith,
    serialiseSnippet,
    snippetRootsOf,
    stripUnits,
    unitRuleRequiringId,
} from "./elementSnippets";
import { walkContainment } from "./moddleContainment";
import type { ModdleElement, ModdlePropertyDescriptor } from "./moddleElement";
import type { PrefixedModdle } from "./upstreamInternals/moddleNamespaces";

/** Which of a unit's own properties its text keeps; foreign attributes always stay. */
export type OwnPropertyFilter = (
    unit: ModdleElement,
    property: ModdlePropertyDescriptor,
) => boolean;

export interface ElementTextOptions {
    /** As for `elementSnapshots`. */
    readonly prefixSources?: readonly string[];
    readonly isUnit?: UnitRule;
    /** Cuts each unit's text to these own properties (default: all). */
    readonly keepOwnProperty?: OwnPropertyFilter;
}

/**
 * Parses `xml` once and returns the text of each unit of `ids` the document
 * holds, as `elementSnapshots` writes its `content`, cut to the own
 * properties `keepOwnProperty` keeps. Rejects like `elementSnapshots`.
 */
export async function elementTexts(
    xml: string,
    ids: Iterable<string>,
    { prefixSources = [xml], isUnit = isDiffUnit, keepOwnProperty }: ElementTextOptions = {},
): Promise<ReadonlyMap<string, string>> {
    const prefixedModdle = await createDocumentModdle(prefixSourcesWith(prefixSources, xml));
    const parsed = await prefixedModdle.moddle.fromXML(xml);
    const skipped = skippedContentWarning(parsed);
    if (skipped) throw new Error(`Failed to parse BPMN: ${skipped}`);
    const definitions = parsed.rootElement;
    const everyElement: ModdleElement[] = [];
    walkContainment(definitions, (element) => everyElement.push(element));
    const unitSet = new Set(everyElement.filter(unitRuleRequiringId(isUnit)));
    const isKnownUnit = (element: ModdleElement) => unitSet.has(element);
    const requested = [...ids]
        .map((id) => parsed.elementsById[id])
        .filter(
            (element): element is ModdleElement & { id: string } =>
                element !== undefined && unitSet.has(element),
        );
    const rootsByUnit = new Map(requested.map((unit) => [unit, snippetRootsOf(unit, isKnownUnit)]));
    stripUnits(
        everyElement.filter((element) => element !== definitions),
        isKnownUnit,
    );
    const texts = new Map<string, string>();
    for (const [unit, roots] of rootsByUnit) {
        if (keepOwnProperty) cutOwnProperties(unit, keepOwnProperty);
        for (const root of roots) walkContainment(root, deleteDerivedReferences);
        texts.set(unit.id, await serialiseSnippet(prefixedModdle, roots, unit.id));
    }
    return texts;
}

/**
 * The text of an element parsed on its own, as `elementTexts` writes a unit:
 * without derived references, cut to the own properties `keepOwnProperty`
 * keeps. Changes the element.
 */
export async function standaloneElementText(
    prefixedModdle: PrefixedModdle,
    element: ModdleElement & { id: string },
    keepOwnProperty?: OwnPropertyFilter,
): Promise<string> {
    if (keepOwnProperty) cutOwnProperties(element, keepOwnProperty);
    walkContainment(element, deleteDerivedReferences);
    return serialiseSnippet(prefixedModdle, [element], element.id);
}

function cutOwnProperties(unit: ModdleElement, keepOwnProperty: OwnPropertyFilter): void {
    for (const property of unit.$descriptor.properties ?? []) {
        if (!keepOwnProperty(unit, property)) delete unit[property.name];
    }
}

/**
 * Sets each reference the parse met again, in document order, to what
 * `resolve` gives for its id: the parser leaves an unresolved one out, and a
 * collection of references keeps its order only when rebuilt from the list.
 * A reference `resolve` gives nothing for stays out.
 */
export function rebindReferences(
    references: readonly ModdleReference[],
    resolve: (id: string) => ModdleElement | undefined,
): void {
    const collections = new Map<ModdleElement, Map<string, ModdleElement[]>>();
    for (const { element, property, id } of references) {
        const descriptor = propertyNamed(element, property);
        if (descriptor === undefined) continue;
        const target = resolve(id);
        if (!descriptor.isMany) {
            if (target === undefined) delete element[descriptor.name];
            else element[descriptor.name] = target;
            continue;
        }
        const byProperty = collections.get(element) ?? new Map<string, ModdleElement[]>();
        collections.set(element, byProperty);
        const targets = byProperty.get(descriptor.name) ?? [];
        byProperty.set(descriptor.name, targets);
        if (target !== undefined) targets.push(target);
    }
    for (const [element, byProperty] of collections) {
        for (const [name, targets] of byProperty) {
            if (targets.length === 0) delete element[name];
            else element[name] = targets;
        }
    }
}

function propertyNamed(
    element: ModdleElement,
    qualifiedName: string,
): ModdlePropertyDescriptor | undefined {
    return (element.$descriptor.properties ?? []).find(
        (property) => property.ns?.name === qualifiedName,
    );
}
