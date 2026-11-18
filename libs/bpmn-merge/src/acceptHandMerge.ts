import {
    type ModdleElement,
    isUnresolvedReferenceWarning,
    namespaceDeclarations,
    rootElementNamesOf,
    standaloneElementText,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";

import type { MergeSources } from "./buildMergedSources";
import {
    type HandMergedVersion,
    type HandMergeOutcome,
    type HandMergeRefusal,
    type HandMergeScope,
    handMergeRefused,
    handMergeScopeOf,
} from "./handMerge";
import { handMergeableSide } from "./handMergeEligibility";
import { isHandMergedProperty, keepsInText, spliceHandMergedText } from "./handMergeSplice";
import {
    type CanonicalElement,
    bindToStubs,
    canonicalElementOf,
    cutElementText,
    isMergeUnit,
    parseElementText,
    referenceStub,
} from "./handMergeText";
import type { MergeDecisions } from "./mergeDecisions";
import { elementReferenceOf } from "./elementVersion";
import { type MergeResult, type MergeSide, otherSide } from "./mergeResult";

const BPMN_MODEL_NAMESPACE = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const CONFLICT_MARKER_LINE = /^(<{7}|\|{7}|={7}|>{7})(\s|$)/m;

type HandMergeAnalysis =
    | { readonly merged: HandMergedVersion }
    | { readonly refusal: HandMergeRefusal };

/**
 * Takes `text` as the version of the picked element `id`, merged by hand from
 * its texts in `sources.handMergeTexts`. A text that writes the picked side's
 * own version takes that version back. Refused, changing nothing, for a text
 * that does not stand as the element's version or that would change another
 * decision.
 */
export async function acceptHandMerge(
    sources: MergeSources,
    decisions: MergeDecisions,
    id: string,
    text: string,
): Promise<HandMergeOutcome> {
    const side = handMergeableSide(decisions, sources.handMergeTexts, id);
    if (side === undefined) return handMergeRefused({ kind: "notHandMergeable" });
    const analysis = await handMergedVersionOf(sources, decisions.result, id, side, text);
    if ("refusal" in analysis) return handMergeRefused(analysis.refusal);
    const { merged } = analysis;
    return merged.content === sources.snapshots[side].get(id)?.content
        ? decisions.dropHandMerge(id)
        : decisions.mergeByHand(merged);
}

/**
 * Reads `text` as the picked side's version of `id` with what the hand merge
 * may change put in: the text parsed as the element's type, spliced into the
 * side's own element, written as the engine's descriptor writes it and read
 * back as a snapshot reads an element. Checks the text alone; the decisions
 * check what it names.
 */
export async function handMergedVersionOf(
    sources: MergeSources,
    result: MergeResult,
    id: string,
    side: MergeSide,
    text: string,
): Promise<HandMergeAnalysis> {
    const snapshot = sources.snapshots[side].get(id);
    const element = result.elements.find((candidate) => candidate.id === id);
    const sideVersion = element?.versions[side];
    if (snapshot === undefined || sideVersion === undefined) {
        return { refusal: { kind: "notHandMergeable" } };
    }
    const type = snapshot.type;
    const scope = handMergeScopeOf(type);
    if (CONFLICT_MARKER_LINE.test(text)) return { refusal: { kind: "conflictMarkersLeft" } };
    const rootRefusal = await rootRefusalOf(text, type);
    if (rootRefusal) return { refusal: rootRefusal };
    const unknown = await unknownNamespacesOf(sources, text);
    if (unknown.length > 0) {
        return { refusal: { kind: "unknownNamespace", namespaces: unknown } };
    }
    const textModdle = sources.snapshotModdle;
    const textRefusal = await textRefusalOf(textModdle, text, type, id, scope);
    if (textRefusal) return { refusal: textRefusal };

    const keep = keepsInText(scope);
    const written = await cutElementText(textModdle, text, type, keep);
    const owningElementOf = owningElementResolver(result, side);
    const spliced = await splicedIntoSide(sources, snapshot.content, written, type, scope);
    if ("refusal" in spliced) return spliced;
    const canonical = await canonicalElementOf(
        textModdle,
        spliced.text,
        type,
        owningElementOf,
    );
    const engineWrites = await cutElementText(textModdle, canonical.content, type, keep);
    const rewritten = await splicedIntoSide(sources, snapshot.content, canonical.content, type, scope);
    if (
        engineWrites !== written ||
        "refusal" in rewritten ||
        (await canonicalElementOf(textModdle, rewritten.text, type, owningElementOf)).content !==
            canonical.content
    ) {
        return {
            refusal: {
                kind: "rejectedByEngine",
                detail: "it writes the text otherwise than it reads it",
            },
        };
    }
    if (canonical.unresolved.length > 0) {
        return { refusal: { kind: "namesMissingElement", ids: [...new Set(canonical.unresolved)] } };
    }
    return {
        merged: {
            id,
            side,
            scope,
            content: canonical.content,
            attributes: canonical.attributes,
            version: { ...sideVersion, ...structureOf(canonical) },
        },
    };
}

function structureOf({ references, parts }: CanonicalElement) {
    return { references: references.map(elementReferenceOf), parts: [...parts] };
}

async function rootRefusalOf(text: string, type: string): Promise<HandMergeRefusal | undefined> {
    const roots = await rootElementNamesOf(text);
    if (roots.length !== 1) return { kind: "notOneElement", found: roots.length };
    const [{ localName, namespace }] = roots as [(typeof roots)[number]];
    const expectedName = tagNameOf(type);
    if (namespace === BPMN_MODEL_NAMESPACE && localName === expectedName) return undefined;
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

/** What the text alone refuses: a parse error or warning, another id, an element of its own inside, a property beyond the scope. */
async function textRefusalOf(
    textModdle: Parameters<typeof parseElementText>[0],
    text: string,
    type: string,
    id: string,
    scope: HandMergeScope,
): Promise<HandMergeRefusal | undefined> {
    let parsed: Awaited<ReturnType<typeof parseElementText>>;
    try {
        parsed = await parseElementText(textModdle, text, type);
    } catch (error) {
        return { kind: "unparsable", detail: messageOf(error) };
    }
    const warnings = parsed.warnings.filter((warning) => !isUnresolvedReferenceWarning(warning));
    if (warnings.length > 0) {
        return {
            kind: "unparsable",
            detail: warnings.map(({ message }) => message ?? "unnamed warning").join("; "),
        };
    }
    const root = parsed.element;
    if (root.id !== id) {
        return root.id === undefined
            ? { kind: "idChanged", expected: id }
            : { kind: "idChanged", expected: id, found: root.id };
    }
    const ownElements: string[] = [];
    walkContainment(root, (inner) => {
        if (inner !== root && isMergeUnit(inner)) ownElements.push(inner.id!);
    });
    if (ownElements.length > 0) return { kind: "holdsElementsOfTheirOwn", ids: ownElements };
    const beyond = (root.$descriptor.properties ?? [])
        .filter(
            (property) =>
                property.name !== "id" &&
                !property.isVirtual &&
                !isHandMergedProperty(property, scope) &&
                hasValue(root[property.name]),
        )
        .map((property) => property.ns?.name ?? property.name);
    return beyond.length > 0 ? { kind: "beyondOwnAttributes", properties: beyond } : undefined;
}

/** The side's own element, parsed from its snapshot, with the text spliced in and written under the engine's descriptor. */
async function splicedIntoSide(
    { mergeModdle }: MergeSources,
    sideContent: string,
    text: string,
    type: string,
    scope: HandMergeScope,
): Promise<{ readonly text: string } | { readonly refusal: HandMergeRefusal }> {
    const sideElement = await parseElementText(mergeModdle, sideContent, type);
    bindToStubs(mergeModdle, sideElement);
    const merged = await parseElementText(mergeModdle, text, type);
    const warnings = merged.warnings.filter((warning) => !isUnresolvedReferenceWarning(warning));
    if (warnings.length > 0) {
        return {
            refusal: {
                kind: "rejectedByEngine",
                detail: warnings.map(({ message }) => message ?? "unnamed warning").join("; "),
            },
        };
    }
    const unit = sideElement.element as ModdleElement & { id: string };
    spliceHandMergedText(unit, merged, scope, isMergeUnit, (outer) =>
        referenceStub(mergeModdle, outer),
    );
    return { text: await standaloneElementText(mergeModdle, unit) };
}

/** The element of the result holding an id: the element itself, else the element whose version holds it as a part, the picked side's first. */
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

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
