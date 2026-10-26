export type ManifestDeclaration =
    | { readonly kind: "alreadyDeclared" }
    | { readonly kind: "declared"; readonly manifestText: string };

export function declareInManifest(
    _manifestText: string | undefined,
    _entry: { readonly name: string },
): ManifestDeclaration {
    return { kind: "declared", manifestText: "" };
}
