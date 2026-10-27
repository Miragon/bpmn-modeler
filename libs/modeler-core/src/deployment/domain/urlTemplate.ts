/** Strips a single trailing slash so a path suffix can be appended cleanly. */
export function stripTrailingSlash(endpoint: string): string {
    return endpoint.replace(/\/$/, "");
}

/**
 * Substitutes `{processDefinitionKey}` in a per-operation override URL. The
 * value is percent-encoded so a key with reserved characters cannot break out
 * of its path segment or inject query parameters.
 */
export function expandUrlTemplate(
    template: string,
    values: { processDefinitionKey: string },
): string {
    return template.replace(/\{processDefinitionKey\}/g, () =>
        encodeURIComponent(values.processDefinitionKey),
    );
}
