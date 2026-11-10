import {
    CACHED_PLUGIN_FILE_PATTERN,
    relativeToRoot,
    toWorkspacePath,
} from "@miragon/bpmn-modeler-core";

/**
 * The IntelliJ `WebviewRoute` serves exactly these files from its own copy of
 * the pattern; `pluginAssetUrl.cases.json` pins both.
 */
const PLUGIN_ASSET = new RegExp(`^${CACHED_PLUGIN_FILE_PATTERN}$`);

/**
 * The root-relative URL under which the IntelliJ BPMN page loads a file of
 * the plugin cache. The page is served from the host's loopback origin, so
 * the URL needs no port. `undefined` for any other path, so nothing outside
 * the cache's `<hash>/plugin.js|css` files gets a URL.
 */
export function pluginAssetUrlOf(cacheRoot: string, path: string): string | undefined {
    const belowRoot = relativeToRoot(toWorkspacePath(path), toWorkspacePath(cacheRoot));
    return belowRoot !== undefined && PLUGIN_ASSET.test(belowRoot)
        ? `/bpmn-plugins/${belowRoot}`
        : undefined;
}
