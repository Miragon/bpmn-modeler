export const NODE_MODULES = "node_modules";

/** A package's name as its folder below the last `node_modules` spells it, else the folder's own name. */
export function installedPackageNameOf(id: string): string {
    const segments = id.split("/");
    const nodeModules = segments.lastIndexOf(NODE_MODULES);
    if (nodeModules === -1) {
        return segments[segments.length - 1];
    }
    return segments.slice(nodeModules + 1).join("/");
}
