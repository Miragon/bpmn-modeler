/**
 * Parses fixture XML with the real `bpmn-moddle`, so the cleanup rules are
 * exercised against the descriptors and reference shapes a live diagram
 * carries — object literals cannot stand in for those, and getting them wrong
 * is what makes this module delete valid model content.
 */
import type { ModdleNode } from "../cleanup/rules";

type ParseResult = { rootElement: unknown; warnings: unknown[] };
type ModdleFactory = () => { fromXML: (xml: string) => Promise<ParseResult> };

/** Mirrors the interop dance in `engine/autoLayoutEngine.ts`. */
async function createModdle() {
    const mod = (await import("bpmn-moddle")) as unknown as {
        default?: ModdleFactory;
        BpmnModdle?: ModdleFactory;
    };
    const factory = mod.default ?? mod.BpmnModdle;
    if (!factory) throw new Error("bpmn-moddle exposes no factory");
    return factory();
}

/**
 * Parses a fixture that must be *valid*.
 *
 * @throws when moddle reports any warning. Asserting that a valid model yields
 *   no findings only means something if the model really is valid, and an
 *   unresolved reference would otherwise silently turn the fixture into the
 *   very garbage it is meant to exclude.
 */
export async function parseDefinitions(xml: string): Promise<ModdleNode> {
    const { rootElement, warnings } = await (await createModdle()).fromXML(xml);
    if (warnings.length > 0) {
        throw new Error(`fixture parsed with warnings: ${JSON.stringify(warnings)}`);
    }
    return rootElement as ModdleNode;
}

/**
 * Parses a fixture that deliberately carries garbage.
 *
 * A dangling reference is exactly what these fixtures are for, and moddle
 * reports one as a warning while dropping the property — which is how the
 * garbage reaches the rules in a real diagram too.
 */
export async function parseBrokenDefinitions(xml: string): Promise<ModdleNode> {
    const { rootElement } = await (await createModdle()).fromXML(xml);
    return rootElement as ModdleNode;
}
