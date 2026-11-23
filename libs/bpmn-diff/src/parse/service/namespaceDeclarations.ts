// Consumer tsc programs do not pick up this lib's ambient shims from its
// tsconfig `include`, so the shim is referenced where `saxen` is imported.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/saxen.d.ts" />

import {
    type NamespaceDeclaration,
    XMLNS,
    XMLNS_PREFIX,
    isNamespaceDeclaration,
} from "../domain/namespacePrefixes";

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
                if (!isNamespaceDeclaration(name)) continue;
                const prefix = name === XMLNS ? undefined : name.slice(XMLNS_PREFIX.length);
                declarations.push({ prefix, uri: decode(value) });
            }
        })
        // The BPMN parser reports malformed XML itself.
        .on("error", () => undefined)
        .parse(xml);
    return declarations;
}
