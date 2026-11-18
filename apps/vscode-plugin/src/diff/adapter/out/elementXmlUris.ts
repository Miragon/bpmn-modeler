import { randomUUID } from "node:crypto";

import { Uri } from "vscode";

/**
 * The URIs of one view of an element's XML. Every view gets its own authority,
 * so two views of one element never share a document; the path names the
 * element for the tab title and ends in `.xml` for the language mode.
 */
export function elementXmlUris(elementId: string): (scheme: string, version?: string) => Uri {
    const authority = randomUUID();
    return (scheme, version) =>
        Uri.from({
            scheme,
            authority,
            path: version === undefined ? `/${elementId}.xml` : `/${elementId}.${version}.xml`,
        });
}
