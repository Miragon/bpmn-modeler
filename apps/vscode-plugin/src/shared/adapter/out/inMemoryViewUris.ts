import { randomUUID } from "node:crypto";

import { Uri } from "vscode";

/**
 * The URIs of one in-memory view of a document. Every view gets its own
 * authority, so two views of one document never share a file; the path names
 * the document for the tab title and ends in `extension` for the language mode.
 */
export function inMemoryViewUris(
    name: string,
    extension: string,
): (scheme: string, version?: string) => Uri {
    const authority = randomUUID();
    return (scheme, version) =>
        Uri.from({
            scheme,
            authority,
            path: version === undefined ? `/${name}.${extension}` : `/${name}.${version}.${extension}`,
        });
}
