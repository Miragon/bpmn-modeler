export interface NamespaceDeclaration {
    /** `undefined` for a default namespace (`xmlns="…"`). */
    prefix: string | undefined;
    uri: string;
}

export const XMLNS = "xmlns";
export const XMLNS_PREFIX = `${XMLNS}:`;

export function isNamespaceDeclaration(attributeName: string): boolean {
    return attributeName === XMLNS || attributeName.startsWith(XMLNS_PREFIX);
}

export function namePrefix(qualifiedName: string): string | undefined {
    const separator = qualifiedName.indexOf(":");
    return separator > 0 ? qualifiedName.slice(0, separator) : undefined;
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
