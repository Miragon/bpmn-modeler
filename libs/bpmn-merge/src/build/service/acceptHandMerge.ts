import {
    type ModdleElement,
    isType,
    isUnresolvedReferenceWarning,
    namespaceDeclarations,
    parseWarningMessages,
    rootElementNamesOf,
    standaloneElementText,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";
import { readConflictMarkers } from "@miragon/bpmn-modeler-types/domain";

import { elementReferenceOf } from "../../classify/domain/elementVersion";
import type { MergeModdle, MergeSources } from "../../sources/domain/mergeSources";
import {
    type HandMergedVersion,
    type HandMergeOutcome,
    type HandMergeRefusal,
    type HandMergeScope,
    type WrongTypeReference,
    handMergeRefused,
    handMergeScopeOf,
} from "../../decide/domain/handMerge";
import { handMergeableSide } from "../../decide/domain/handMergeEligibility";
import {
    isHandMergedProperty,
    keepsInText,
    spliceHandMergedText,
} from "../../sources/domain/handMergeSplice";
import {
    type CanonicalElement,
    bindToStubs,
    canonicalElementOf,
    cutElementText,
    isMergeUnit,
    parseElementText,
    referenceStub,
} from "../../sources/service/handMergeText";
import type { MergeDecisions } from "../../decide/domain/mergeDecisions";
import { isMergeElement } from "../../kernel/domain/mergeElements";
import { type MergeResult, type MergeSide, otherSide } from "../../kernel/domain/mergeResult";

const BPMN_MODEL_NAMESPACE = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const XML_SCHEMA_INSTANCE_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

type Refused = { readonly refusal: HandMergeRefusal };

/** What a text gives the element as its build would write it, read back as a snapshot reads an element. */
interface ElementText {
    readonly type: string;
    readonly scope: HandMergeScope;
    /** The picked side's own element, which the text is spliced into. */
    readonly sideContent: string;
    readonly owningElementOf: (id: string) => string | undefined;
    /** The type of an element or part outside the text, the side's first. */
    readonly typeOfOuter: (id: string) => string | undefined;
}

/**
 * Takes `text`, merged by hand from the texts in `sources.handMergeTexts`, as
 * the version of `id` on `side`, the side it was merged for. A text that
 * writes the side's own version takes that version back. Refused, changing
 * nothing, while the element is not picked on `side`, and for a text that does
 * not stand as the element's version or that would change another decision.
 */
export async function acceptHandMerge(
    sources: MergeSources,
    decisions: MergeDecisions,
    id: string,
    side: MergeSide,
    text: string,
): Promise<HandMergeOutcome> {
    if (handMergeableSide(decisions, sources.handMergeTexts, id) !== side) {
        return handMergeRefused({ kind: "notHandMergeable" });
    }
    const analysis = await handMergedVersionOf(sources, decisions.result, id, side, text);
    if ("refusal" in analysis) return handMergeRefused(analysis.refusal);
    const { merged } = analysis;
    return merged.content === sources.snapshots[side].get(id)?.content
        ? decisions.dropHandMerge(id)
        : decisions.mergeByHand(merged);
}

/**
 * Reads `text` as the picked side's version of `id` with what the hand merge
 * may change put in: parsed as the element's type, spliced into the side's own
 * element, written under the engine's descriptor and read back as a snapshot
 * reads an element. Checks the text alone; the decisions check what it names.
 */
export async function handMergedVersionOf(
    sources: MergeSources,
    result: MergeResult,
    id: string,
    side: MergeSide,
    text: string,
): Promise<{ readonly merged: HandMergedVersion } | Refused> {
    const snapshot = sources.snapshots[side].get(id);
    const sideVersion = result.elements.find((element) => element.id === id)?.versions[side];
    if (snapshot === undefined || sideVersion === undefined) {
        return { refusal: { kind: "notHandMergeable" } };
    }
    const element: ElementText = {
        type: snapshot.type,
        scope: handMergeScopeOf(snapshot.type),
        sideContent: snapshot.content,
        owningElementOf: owningElementResolver(result, side),
        typeOfOuter: (outer) =>
            sources.types[side].get(outer) ?? sources.types[otherSide(side)].get(outer),
    };
    const refusal = await textRefusalOf(sources, text, id, element);
    if (refusal) return { refusal };
    const written = await cutElementText(
        sources.snapshotModdle,
        text,
        element.type,
        keepsInText(element.scope),
    );
    const canonical = await asTheBuildWrites(sources, written, element);
    if ("refusal" in canonical) return canonical;
    if (canonical.unresolved.length > 0) {
        return {
            refusal: { kind: "namesMissingElement", ids: [...new Set(canonical.unresolved)] },
        };
    }
    return {
        merged: {
            id,
            side,
            scope: element.scope,
            content: canonical.content,
            shownText: written,
            attributes: canonical.attributes,
            version: {
                ...sideVersion,
                references: canonical.references.map(elementReferenceOf),
                parts: [...canonical.parts],
            },
        },
    };
}

/** What the text alone refuses, before it is spliced anywhere. */
async function textRefusalOf(
    sources: MergeSources,
    text: string,
    id: string,
    { type, scope, typeOfOuter }: ElementText,
): Promise<HandMergeRefusal | undefined> {
    if (readConflictMarkers(text).hasMarkers) return { kind: "conflictMarkersLeft" };
    const rootRefusal = await rootRefusalOf(text, type);
    if (rootRefusal) return rootRefusal;
    const unknown = await unknownNamespacesOf(sources, text);
    if (unknown.length > 0) return { kind: "unknownNamespace", namespaces: unknown };
    let parsed: Awaited<ReturnType<typeof parseElementText>>;
    try {
        parsed = await parseElementText(sources.snapshotModdle, text, type);
    } catch (error) {
        return {
            kind: "unparsable",
            detail: error instanceof Error ? error.message : String(error),
        };
    }
    const warnings = parseWarningsOf(parsed.warnings);
    if (warnings) return { kind: "unparsable", detail: warnings };
    const root = parsed.element;
    if (root.id !== id) {
        return root.id === undefined
            ? { kind: "idChanged", expected: id }
            : { kind: "idChanged", expected: id, found: root.id };
    }
    const xsiType = xsiTypeOf(root);
    if (xsiType !== undefined) return { kind: "typeChanged", expected: type, found: xsiType };
    const ownElements: string[] = [];
    walkContainment(root, (inner) => {
        if (inner !== root && isMergeElement(inner)) {
            ownElements.push(inner.id ?? `a ${inner.$type} without an id`);
        }
    });
    if (ownElements.length > 0) return { kind: "holdsElementsOfTheirOwn", ids: ownElements };
    const beyond = propertiesBeyond(root, scope);
    if (beyond.length > 0) return { kind: "beyondOwnAttributes", properties: beyond };
    const wrongType = wrongTypeReferencesOf(sources, parsed, typeOfOuter);
    return wrongType.length > 0 ? { kind: "namesWrongType", references: wrongType } : undefined;
}

/** The root's `xsi:type`, which would name another type than its tag in the built file. */
function xsiTypeOf(root: ModdleElement): string | undefined {
    const attributes = root.$attrs ?? {};
    for (const [name, value] of Object.entries(attributes)) {
        const [prefix, localName] = name.split(":");
        const isSchemaInstance =
            prefix === "xsi" || attributes[`xmlns:${prefix}`] === XML_SCHEMA_INSTANCE_NAMESPACE;
        if (localName === "type" && isSchemaInstance) return value;
    }
    return undefined;
}

/**
 * The references whose target is not of the type their property takes: a
 * target inside the text by its own type, one outside by `typeOfOuter`. A
 * target of no known type is left to the check for missing elements.
 */
function wrongTypeReferencesOf(
    { mergeModdle }: MergeSources,
    { references, elementsById }: Awaited<ReturnType<typeof parseElementText>>,
    typeOfOuter: (id: string) => string | undefined,
): WrongTypeReference[] {
    return references.flatMap(({ element, property, id }) => {
        const expected = element.$descriptor.properties?.find(
            (candidate) => candidate.ns?.name === property,
        )?.type;
        const actual = elementsById[id]?.$type ?? typeOfOuter(id);
        if (expected === undefined || actual === undefined) return [];
        return isOfType(mergeModdle, actual, expected) ? [] : [{ property, target: id, expected }];
    });
}

function isOfType({ moddle }: MergeModdle, actual: string, expected: string): boolean {
    try {
        return isType(moddle.create(actual), expected);
    } catch {
        return true;
    }
}

/**
 * The element the build writes from `text`, read back. Refused when the
 * engine's descriptor writes the text otherwise than it reads it, or when
 * writing what it wrote again would change it, since the build would then
 * refuse the file.
 */
async function asTheBuildWrites(
    sources: MergeSources,
    text: string,
    element: ElementText,
): Promise<CanonicalElement | Refused> {
    const once = await splicedAndReadBack(sources, text, element);
    if ("refusal" in once) return once;
    const twice = await splicedAndReadBack(sources, once.content, element);
    const writtenBack = await cutElementText(
        sources.snapshotModdle,
        once.content,
        element.type,
        keepsInText(element.scope),
    );
    if ("refusal" in twice || twice.content !== once.content || writtenBack !== text) {
        return {
            refusal: {
                kind: "rejectedByEngine",
                detail: "it writes the text otherwise than it reads it",
            },
        };
    }
    return once;
}

/** `text` spliced into the side's own element under the engine's descriptor, then read as a snapshot reads it. */
async function splicedAndReadBack(
    { mergeModdle, snapshotModdle }: MergeSources,
    text: string,
    { type, scope, sideContent, owningElementOf }: ElementText,
): Promise<CanonicalElement | Refused> {
    const merged = await parseElementText(mergeModdle, text, type);
    const warnings = parseWarningsOf(merged.warnings);
    if (warnings) return { refusal: { kind: "rejectedByEngine", detail: warnings } };
    const sideElement = await parseElementText(mergeModdle, sideContent, type);
    bindToStubs(mergeModdle, sideElement);
    const unit = sideElement.element as ModdleElement & { id: string };
    spliceHandMergedText(unit, merged, scope, isMergeUnit, (outer) =>
        referenceStub(mergeModdle, outer),
    );
    const written = await standaloneElementText(mergeModdle, unit);
    return canonicalElementOf(snapshotModdle, written, type, owningElementOf);
}

async function rootRefusalOf(text: string, type: string): Promise<HandMergeRefusal | undefined> {
    const roots = await rootElementNamesOf(text);
    if (roots.length !== 1) return { kind: "notOneElement", found: roots.length };
    const [{ localName, namespace }] = roots as [(typeof roots)[number]];
    if (namespace === BPMN_MODEL_NAMESPACE && localName === tagNameOf(type)) return undefined;
    return {
        kind: "typeChanged",
        expected: type,
        found: namespace === BPMN_MODEL_NAMESPACE ? `bpmn:${upperFirst(localName)}` : localName,
    };
}

async function unknownNamespacesOf({ mergeModdle }: MergeSources, text: string): Promise<string[]> {
    const used = (await namespaceDeclarations(text)).map(({ uri }) => uri);
    return [...new Set(used.filter((uri) => !mergeModdle.knowsNamespace(uri)))];
}

/** Every parse warning but an unresolved reference, which names an element outside the text. */
function parseWarningsOf(
    warnings: Awaited<ReturnType<typeof parseElementText>>["warnings"],
): string | undefined {
    const messages = parseWarningMessages(warnings, isUnresolvedReferenceWarning);
    return messages.length > 0 ? messages.join("; ") : undefined;
}

function propertiesBeyond(root: ModdleElement, scope: HandMergeScope): string[] {
    return (root.$descriptor.properties ?? [])
        .filter(
            (property) =>
                property.name !== "id" &&
                !property.isVirtual &&
                !isHandMergedProperty(property, scope) &&
                hasValue(root[property.name]),
        )
        .map((property) => property.ns?.name ?? property.name);
}

/** The element of the result holding an id: the element itself, else the one whose version holds it as a part, the picked side's first. */
function owningElementResolver(
    result: MergeResult,
    side: MergeSide,
): (id: string) => string | undefined {
    const owners = new Map<string, string>(result.elements.map(({ id }) => [id, id]));
    for (const version of [side, otherSide(side), "base"] as const) {
        for (const element of result.elements) {
            for (const part of element.versions[version]?.parts ?? []) {
                if (!owners.has(part)) owners.set(part, element.id);
            }
        }
    }
    return (id) => owners.get(id);
}

function tagNameOf(type: string): string {
    const localName = type.slice(type.indexOf(":") + 1);
    return localName.charAt(0).toLowerCase() + localName.slice(1);
}

function upperFirst(name: string): string {
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function hasValue(value: unknown): boolean {
    return value !== undefined && !(Array.isArray(value) && value.length === 0);
}
