/**
 * Extracts the human-visible basename from a stringified URI.
 *
 * Trims query/fragment so e.g. `file:///foo.bpmn?ref=HEAD` still resolves to
 * `foo.bpmn`. `Uri.toString()` keeps `?` / `#` for any host that uses them;
 * the bare path is what users see in the tab and in the diff legend label.
 */
export function basenameOfUriString(uri: string): string {
    const noFragment = uri.split("#")[0];
    const noQuery = noFragment.split("?")[0];
    const parts = noQuery.split("/");
    return decodeURIComponent(parts[parts.length - 1]);
}
