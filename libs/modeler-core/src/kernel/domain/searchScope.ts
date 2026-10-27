/**
 * Where a workspace search for a document looks: every workspace folder, or,
 * for a loose file outside all folders, the tree under its directory.
 */
export type SearchScope =
    | { readonly kind: "workspace-folders"; readonly folders: readonly string[] }
    | { readonly kind: "loose-file"; readonly directory: string };

export function searchScopeRoots(scope: SearchScope): readonly string[] {
    return scope.kind === "workspace-folders" ? scope.folders : [scope.directory];
}

// The kind is part of the key: removing a document's only folder turns the
// document loose in that same directory, which is searched differently.
export function searchScopeKey(scope: SearchScope): string {
    return [scope.kind, ...searchScopeRoots(scope)].join("\0");
}
