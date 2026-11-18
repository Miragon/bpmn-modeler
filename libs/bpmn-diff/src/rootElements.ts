// Consumer tsc programs do not pick up this lib's ambient shims from its
// tsconfig `include`, so the shim is referenced where `saxen` is imported.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/saxen.d.ts" />

import { XMLNS_PREFIX, namePrefix } from "./namespaceDeclarations";

export interface RootElementName {
    readonly localName: string;
    /** The namespace its prefix, or the default namespace, names on the tag itself; none when the tag does not declare it. */
    readonly namespace?: string;
}

/**
 * The top-level elements of `text` by the names written there. The parser
 * reads a root as the type it is asked for whenever the tag is that type or a
 * subtype, so only the text tells a changed tag. Malformed XML gives what was
 * read before the error; the parser reports the error itself.
 */
export async function rootElementNamesOf(text: string): Promise<readonly RootElementName[]> {
    const { Parser, decode } = await import("saxen");
    const roots: RootElementName[] = [];
    let depth = 0;
    new Parser()
        .on("openTag", (name, getAttrs) => {
            if (depth === 0) roots.push(rootNameOf(name, getAttrs(), decode));
            depth++;
        })
        // A self-closing tag closes too.
        .on("closeTag", () => {
            depth--;
        })
        .on("error", () => undefined)
        .parse(text);
    return roots;
}

function rootNameOf(
    qualifiedName: string,
    attributes: Record<string, string>,
    decode: (text: string) => string,
): RootElementName {
    const prefix = namePrefix(qualifiedName);
    const localName = prefix === undefined ? qualifiedName : qualifiedName.slice(prefix.length + 1);
    const declared = attributes[prefix === undefined ? "xmlns" : `${XMLNS_PREFIX}${prefix}`];
    return declared === undefined ? { localName } : { localName, namespace: decode(declared) };
}
