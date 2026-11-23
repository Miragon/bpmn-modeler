import { skippedContentWarning } from "../../moddle/domain/bpmnModdleFactory";
import type { ModdleElement, ModdlePropertyDescriptor } from "../../moddle/domain/moddleElement";
import type { PrefixedModdle } from "../../parse/domain/upstreamInternals/moddleNamespaces";
import { type UnitRule, isDiffUnit, snippetRootsOf } from "../domain/elementSnippets";
import { parsedUnitsOf, stripEveryUnit, unitContentOf } from "./parsedUnits";

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
