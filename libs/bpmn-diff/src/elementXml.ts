import { skippedContentWarning } from "./bpmnModdleFactory";
import { createDocumentModdle } from "./documentModdle";
import {
    isDiffUnit,
    isSemanticElement,
    prefixSourcesWith,
    serialiseSnippet,
    snippetRootsOf,
    stripUnits,
    unitRuleRequiringId,
} from "./elementSnippets";
import { walkContainment } from "./moddleContainment";
import type { ModdleElement } from "./moddleElement";

/**
 * Returns the XML of one BPMN element without its diagram interchange and
 * without the children the diff reports under their own id (flow elements,
 * lanes, participants, message flows, data associations, …), or `undefined`
 * when `elementId` names no semantic element. Other children, such as lane
 * sets, data objects, artifacts and any child without an id, stay, because
 * the diff counts their changes for this element. A participant's snippet is followed by the
 * process whose changes the diff reports under the participant's id.
 *
 * The snippet is re-serialised, not cut from the source: formatting and
 * comments differ from the file, attributes without a descriptor are sorted,
 * and each namespace is written with one prefix taken from the declarations
 * in `prefixSources`, then in `xml`. Two versions given the same
 * `prefixSources` therefore write a namespace with the same prefix. It
 * declares only the namespaces it uses. No engine descriptor is loaded, so
 * Camunda 7 and 8 extensions round-trip as generic elements.
 *
 * Rejects when `xml` cannot be parsed, when the parser skips content, and
 * when the snippet would use a prefix it cannot declare.
 */
export async function elementXml(
    xml: string,
    elementId: string,
    prefixSources: readonly string[] = [xml],
): Promise<string | undefined> {
    const prefixedModdle = await createDocumentModdle(prefixSourcesWith(prefixSources, xml));
    const parsed = await prefixedModdle.moddle.fromXML(xml);
    const skipped = skippedContentWarning(parsed);
    if (skipped) throw new Error(`Failed to parse BPMN for the XML of ${elementId}: ${skipped}`);
    const element = parsed.elementsById[elementId];
    if (!element || !isSemanticElement(element)) return undefined;

    const isUnit = unitRuleRequiringId(isDiffUnit);
    const snippetRoots = snippetRootsOf(element, isUnit);
    const snippetElements: ModdleElement[] = [];
    for (const root of snippetRoots) walkContainment(root, (child) => snippetElements.push(child));
    stripUnits(snippetElements, isUnit);
    return serialiseSnippet(prefixedModdle, snippetRoots, elementId);
}
