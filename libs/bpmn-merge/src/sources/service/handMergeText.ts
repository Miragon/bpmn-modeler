import {
    type ModdleElement,
    type ModdleParseResult,
    type OwnPropertyFilter,
    type PrefixedModdle,
    type SnapshotReference,
    isModdleElement,
    ownAttributeEntries,
    rebindReferences,
    standaloneElementText,
    unitParts,
    unitReferences,
} from "@miragon/bpmn-modeler-diff";

import type { ParsedElementText } from "../domain/handMergeSplice";
import { isMergeElement } from "../../kernel/domain/mergeElements";

/** An element's text parsed on its own, written again as a snapshot writes it. */
export interface CanonicalElement {
    readonly content: string;
    readonly attributes: Readonly<Record<string, string>>;
    readonly references: readonly SnapshotReference[];
    readonly parts: readonly string[];
    /** Ids the text names that `owningElementOf` places in no element. */
    readonly unresolved: readonly string[];
}

export async function parseElementText(
    { moddle }: PrefixedModdle,
    text: string,
    type: string,
): Promise<ParsedElementText & { readonly warnings: NonNullable<ModdleParseResult["warnings"]> }> {
    const parsed = await moddle.fromXML(text, type);
    return {
        element: parsed.rootElement,
        references: parsed.references ?? [],
        elementsById: parsed.elementsById,
        warnings: parsed.warnings ?? [],
    };
}

/** Stands in for an element outside the text, which the serializer writes by its id. */
export function referenceStub(prefixedModdle: PrefixedModdle, id: string): ModdleElement {
    return prefixedModdle.moddle.create("bpmn:BaseElement", { id });
}

/** Every reference to an element outside the text named by a stub, so the text writes it again. */
export function bindToStubs(prefixedModdle: PrefixedModdle, text: ParsedElementText): void {
    rebindReferences(
        text.references,
        (id) => text.elementsById[id] ?? referenceStub(prefixedModdle, id),
    );
}

export function isMergeUnit(element: ModdleElement): boolean {
    return typeof element.id === "string" && isMergeElement(element);
}

/** The text parsed on its own under the snapshots' moddle, cut to what `keepOwnProperty` keeps. */
export async function cutElementText(
    textModdle: PrefixedModdle,
    text: string,
    type: string,
    keepOwnProperty: OwnPropertyFilter,
): Promise<string> {
    const parsed = await parseElementText(textModdle, text, type);
    bindToStubs(textModdle, parsed);
    return standaloneElementText(textModdle, withId(parsed.element), keepOwnProperty);
}

/**
 * The element `text` writes, under the snapshots' moddle, with the references
 * and parts a snapshot would give it: a reference names the element holding
 * its target by `owningElementOf`, or the element itself for one inside the
 * text.
 */
export async function canonicalElementOf(
    textModdle: PrefixedModdle,
    text: string,
    type: string,
    owningElementOf: (id: string) => string | undefined,
): Promise<CanonicalElement> {
    const parsed = await parseElementText(textModdle, text, type);
    bindToStubs(textModdle, parsed);
    const element = withId(parsed.element);
    const unresolved: string[] = [];
    const references = unitReferences(element, [element], isMergeUnit, (target) => {
        if (liesInside(target, element)) return element.id;
        const owner = owningElementOf(target.id ?? "");
        if (owner === undefined || owner === element.id) {
            unresolved.push(target.id ?? "");
            return undefined;
        }
        return owner;
    });
    const attributes: Record<string, string> = {};
    for (const { name, value } of ownAttributeEntries(element)) attributes[name] = value;
    return {
        references,
        parts: unitParts(element, [element]),
        attributes,
        content: await standaloneElementText(textModdle, element),
        unresolved,
    };
}

function liesInside(target: ModdleElement, root: ModdleElement): boolean {
    for (let current: unknown = target; isModdleElement(current); current = current.$parent) {
        if (current === root) return true;
    }
    return false;
}

function withId(element: ModdleElement): ModdleElement & { id: string } {
    return element as ModdleElement & { id: string };
}
