/**
 * Typed adapter around two undocumented parts of moddle-xml, which bpmn-moddle
 * reads and writes XML with: the `nsMap` option, by which the parser names a
 * namespace with a chosen prefix, and the prefixes of its private
 * `DEFAULT_NS_MAP`, which the serializer declares by itself. The spec beside it
 * pins both to the installed version.
 */
import type { BpmnModdle, BpmnModdleFactory } from "../bpmnModdleFactory";

/** A copy of moddle-xml's private `DEFAULT_NS_MAP`. */
const DEFAULT_NS_MAP: ReadonlyArray<readonly [string, string]> = [
    ["xsi", "http://www.w3.org/2001/XMLSchema-instance"],
    ["xml", "http://www.w3.org/XML/1998/namespace"],
];

export interface PrefixedModdle {
    readonly moddle: BpmnModdle;
    /**
     * The `xmlns` declarations, prefix to namespace, that a snippet using
     * `prefixes` needs. Throws for a prefix that is neither an `nsMap` prefix
     * nor one the serializer declares, whose names the serializer would drop.
     */
    declarationsFor(prefixes: readonly string[], subject: string): Map<string, string>;
}

/** Prefix to namespace; reserving them keeps every other namespace's prefix from colliding. */
export function serializerPrefixes(createBpmnModdle: BpmnModdleFactory): Map<string, string> {
    return ownPrefixes(createBpmnModdle());
}

/** A moddle whose parser names each namespace of `prefixByUri` by its prefix. */
export function createPrefixedModdle(
    createBpmnModdle: BpmnModdleFactory,
    prefixByUri: ReadonlyMap<string, string>,
): PrefixedModdle {
    const moddle = createBpmnModdle({}, { nsMap: Object.fromEntries(prefixByUri) });
    const reserved = ownPrefixes(moddle);
    const uriByPrefix = new Map([...prefixByUri].map(([uri, prefix]) => [prefix, uri]));
    return {
        moddle,
        declarationsFor(prefixes, subject) {
            const declarations = new Map<string, string>();
            for (const prefix of prefixes) {
                if (reserved.has(prefix)) continue;
                const uri = uriByPrefix.get(prefix);
                if (!uri) {
                    throw new Error(
                        `The XML of ${subject} uses the namespace prefix ${prefix}, which it does not declare: ` +
                            "moddle-xml names every namespace by its `nsMap` prefix or by one it declares itself.",
                    );
                }
                declarations.set(prefix, uri);
            }
            return declarations;
        },
    };
}

function ownPrefixes(moddle: BpmnModdle): Map<string, string> {
    return new Map([
        ...DEFAULT_NS_MAP,
        ...moddle.getPackages().map(({ prefix, uri }) => [prefix, uri] as const),
    ]);
}
