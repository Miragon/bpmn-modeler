// Consumer tsc programs do not pick up this lib's ambient shims from its
// tsconfig `include`, so the shim is referenced where `saxen` is imported.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/saxen.d.ts" />

export interface NamespaceDeclaration {
    /** `undefined` for a default namespace (`xmlns="…"`). */
    prefix: string | undefined;
    uri: string;
}

const XMLNS = "xmlns";
const XMLNS_PREFIX = `${XMLNS}:`;

/**
 * Every `xmlns` declaration on an element of `xml`, in document order, with
 * its namespace name decoded as the BPMN parser decodes it. Comments, CDATA
 * and text declare nothing. The tokenizer loads lazily, like the parser.
 */
export async function namespaceDeclarations(xml: string): Promise<NamespaceDeclaration[]> {
    const { Parser, decode } = await import("saxen");
    const declarations: NamespaceDeclaration[] = [];
    new Parser()
        .on("openTag", (_name, getAttrs) => {
            for (const [name, value] of Object.entries(getAttrs())) {
                if (name !== XMLNS && !name.startsWith(XMLNS_PREFIX)) continue;
                const prefix = name === XMLNS ? undefined : name.slice(XMLNS_PREFIX.length);
                declarations.push({ prefix, uri: decode(value) });
            }
        })
        // The BPMN parser reports malformed XML itself.
        .on("error", () => undefined)
        .parse(xml);
    return declarations;
}

/**
 * Gives every declared namespace one prefix: the first prefix it is declared
 * with, or a fresh `ns<n>` when that prefix already names another namespace.
 * Namespaces in `reservedPrefixes` keep theirs.
 */
export function documentPrefixes(
    declarations: readonly NamespaceDeclaration[],
    reservedPrefixes: ReadonlyMap<string, string>,
): Map<string, string> {
    const prefixByUri = new Map<string, string>();
    const takenPrefixes = new Set(reservedPrefixes.keys());
    const reservedUris = new Set(reservedPrefixes.values());
    let anonymousCount = 0;
    for (const { prefix, uri } of declarations) {
        if (reservedUris.has(uri) || prefixByUri.has(uri)) continue;
        let documentPrefix = prefix ?? `ns${anonymousCount++}`;
        while (takenPrefixes.has(documentPrefix)) documentPrefix = `ns${anonymousCount++}`;
        takenPrefixes.add(documentPrefix);
        prefixByUri.set(uri, documentPrefix);
    }
    return prefixByUri;
}
