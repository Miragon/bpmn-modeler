import { relativeToRoot, toWorkspacePath } from "@miragon/bpmn-modeler-core";

/** Kept in step with the IntelliJ `WebviewRoute`, which serves exactly these files. */
const PLUGIN_ASSET = /^[0-9a-f]{64}\/plugin\.(?:js|css)$/;

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
