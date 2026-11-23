import type { ModdleElement } from "../../moddle/domain/moddleElement";
import { walkContainment } from "../../parse/domain/moddleContainment";
import {
    XMLNS_PREFIX,
    isNamespaceDeclaration,
    namePrefix,
} from "../../parse/domain/namespacePrefixes";
import type { PrefixedModdle } from "../../parse/domain/upstreamInternals/moddleNamespaces";

export async function serialiseSnippet(
    { moddle, declarationsFor }: PrefixedModdle,
    roots: readonly ModdleElement[],
    subject: string,
): Promise<string> {
    const snippets: string[] = [];
    for (const root of roots) {
        sortAttributesWithoutDescriptor(root);
        declareNamespaces(root, declarationsFor(usedPrefixes(root), subject));
        const { xml } = await moddle.toXML(root, { format: true, preamble: false });
        snippets.push(xml.trimEnd());
    }
    return snippets.join("\n\n");
}

/**
 * The serializer writes attributes without a descriptor in source order, so
 * two files that order them differently would give different text.
 * Declarations inside the snippet are dropped, the default one too, since the
 * parser has already renamed every namespace to its document prefix.
 */
function sortAttributesWithoutDescriptor(root: ModdleElement): void {
    walkContainment(root, (element) => {
        const attributes = attributesWithoutDescriptor(element);
        const sortedEntries = Object.entries(attributes)
            .filter(([name]) => !name.startsWith("$") && !isNamespaceDeclaration(name))
            .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
        for (const name of Object.keys(attributes)) {
            if (!name.startsWith("$")) delete attributes[name];
        }
        for (const [name, value] of sortedEntries) attributes[name] = value;
    });
}

function usedPrefixes(root: ModdleElement): string[] {
    const prefixes = new Set<string>();
    walkContainment(root, (element) => {
        const qualifiedNames = element.$descriptor.isGeneric
            ? [element.$type, ...Object.keys(element)]
            : Object.keys(element.$attrs ?? {});
        for (const name of qualifiedNames) {
            const prefix = namePrefix(name);
            if (prefix) prefixes.add(prefix);
        }
    });
    return [...prefixes];
}

/** Without a descriptor the serializer drops prefixed names whose namespace the snippet does not declare. */
function declareNamespaces(root: ModdleElement, uriByPrefix: ReadonlyMap<string, string>): void {
    const attributes = (root.$attrs ??= {});
    for (const [prefix, uri] of uriByPrefix) attributes[XMLNS_PREFIX + prefix] = uri;
}

function attributesWithoutDescriptor(element: ModdleElement): Record<string, unknown> {
    return element.$descriptor.isGeneric ? element : (element.$attrs ?? {});
}
