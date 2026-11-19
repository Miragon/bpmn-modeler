import type { ModdleParseResult } from "./bpmnModdleFactory";
import { createDocumentModdle } from "./documentModdle";
import {
    type UnitRule,
    deleteDerivedReferences,
    prefixSourcesWith,
    serialiseSnippet,
    stripUnits,
    unitRuleRequiringId,
} from "./elementSnippets";
import { walkContainment } from "./moddleContainment";
import type { ModdleElement } from "./moddleElement";
import type { PrefixedModdle } from "./upstreamInternals/moddleNamespaces";

/** A document parsed once, with the elements that are units of their own. */
export interface ParsedUnits {
    readonly prefixedModdle: PrefixedModdle;
    readonly parsed: ModdleParseResult;
    readonly everyElement: readonly ModdleElement[];
    /** Every unit with an id, in the parser's id order. */
    readonly units: readonly (ModdleElement & { id: string })[];
    readonly isKnownUnit: (element: ModdleElement) => boolean;
}

/**
 * Parses `xml` under the prefixes of `prefixSources` and the document, and
 * finds its units by `isUnit` before anything is stripped. Rejects with what
 * `rejectionOf` names.
 */
export async function parsedUnitsOf(
    xml: string,
    prefixSources: readonly string[],
    isUnit: UnitRule,
    rejectionOf: (parsed: ModdleParseResult) => string | undefined,
): Promise<ParsedUnits> {
    const prefixedModdle = await createDocumentModdle(prefixSourcesWith(prefixSources, xml));
    const parsed = await prefixedModdle.moddle.fromXML(xml);
    const rejection = rejectionOf(parsed);
    if (rejection) throw new Error(`Failed to parse BPMN: ${rejection}`);
    const everyElement: ModdleElement[] = [];
    walkContainment(parsed.rootElement, (element) => everyElement.push(element));
    const unitSet = new Set(everyElement.filter(unitRuleRequiringId(isUnit)));
    const units = Object.values(parsed.elementsById).filter(
        (element): element is ModdleElement & { id: string } =>
            element !== undefined && unitSet.has(element),
    );
    return {
        prefixedModdle,
        parsed,
        everyElement,
        units,
        isKnownUnit: (element) => unitSet.has(element),
    };
}

/** Removes every unit from its holder, so each unit's text leaves out the units inside it. */
export function stripEveryUnit({ parsed, everyElement, isKnownUnit }: ParsedUnits): void {
    stripUnits(
        everyElement.filter((element) => element !== parsed.rootElement),
        isKnownUnit,
    );
}

/** A stripped unit's text without the references the modeler derives, as a snapshot's `content`. */
export async function unitContentOf(
    prefixedModdle: PrefixedModdle,
    roots: readonly ModdleElement[],
    id: string,
): Promise<string> {
    for (const root of roots) walkContainment(root, deleteDerivedReferences);
    return serialiseSnippet(prefixedModdle, roots, id);
}
