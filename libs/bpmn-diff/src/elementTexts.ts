import { type ModdleReference, skippedContentWarning } from "./bpmnModdleFactory";
import { type UnitRule, isDiffUnit, snippetRootsOf } from "./elementSnippets";
import type { ModdleElement, ModdlePropertyDescriptor } from "./moddleElement";
import { parsedUnitsOf, stripEveryUnit, unitContentOf } from "./parsedUnits";
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

/** A unit's type and its text. */
export interface UnitText {
    readonly type: string;
    readonly text: string;
}

/**
 * Parses `xml` once and returns the type and text of each unit of `ids` the
 * document holds, the text as `elementSnapshots` writes its `content`, cut to
 * the own properties `keepOwnProperty` keeps. Rejects like `elementSnapshots`.
 */
export async function elementTexts(
    xml: string,
    ids: Iterable<string>,
    { prefixSources = [xml], isUnit = isDiffUnit, keepOwnProperty }: ElementTextOptions = {},
): Promise<ReadonlyMap<string, UnitText>> {
    const parsedUnits = await parsedUnitsOf(xml, prefixSources, isUnit, skippedContentWarning);
    const { prefixedModdle, parsed, isKnownUnit } = parsedUnits;
    const requested = [...ids]
        .map((id) => parsed.elementsById[id])
        .filter(
            (element): element is ModdleElement & { id: string } =>
                element !== undefined && isKnownUnit(element),
        );
    const rootsByUnit = new Map(requested.map((unit) => [unit, snippetRootsOf(unit, isKnownUnit)]));
    stripEveryUnit(parsedUnits);
    const texts = new Map<string, UnitText>();
    for (const [unit, roots] of rootsByUnit) {
        if (keepOwnProperty) cutOwnProperties(unit, keepOwnProperty);
        texts.set(unit.id, {
            type: unit.$type,
            text: await unitContentOf(prefixedModdle, roots, unit.id),
        });
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
    return unitContentOf(prefixedModdle, [element], element.id);
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
