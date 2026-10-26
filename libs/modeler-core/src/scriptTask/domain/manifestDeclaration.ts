export type ManifestDeclaration =
    | { readonly kind: "alreadyDeclared" }
    | { readonly kind: "declared"; readonly manifestText: string };

interface ManifestEntry {
    readonly name: string;
}

/**
 * `manifestText` is `undefined` when no manifest exists yet. Throws a
 * `SyntaxError` unless the text is a JSON object, so hand-edited content is
 * never overwritten.
 */
export function declareInManifest(
    manifestText: string | undefined,
    entry: ManifestEntry,
): ManifestDeclaration {
    const manifest = manifestText === undefined ? {} : parseManifestObject(manifestText);
    const variables: readonly ManifestEntry[] = Array.isArray(manifest.variables)
        ? manifest.variables
        : [];
    if (variables.some((existing) => existing.name === entry.name)) {
        return { kind: "alreadyDeclared" };
    }
    const declared = { ...manifest, variables: [...variables, entry] };
    return { kind: "declared", manifestText: `${JSON.stringify(declared, null, 2)}\n` };
}

function parseManifestObject(manifestText: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(manifestText);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new SyntaxError("The variable manifest must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
}
