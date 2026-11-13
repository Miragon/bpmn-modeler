import { joinWorkspacePath } from "./workspacePath";

export const NODE_MODULES = "node_modules";

const SCOPE_PREFIX = "@";

/** Where a package folder is installed: the `node_modules` holding it and its name below it. */
export interface InstalledPlace {
    readonly dir: string;
    /** Empty when the path stops before a whole name, such as at a scope folder. */
    readonly name: string;
}

/** A scoped name, `@scope/name`, spans two parts; `undefined` when fewer follow. */
export function packageNamePartsOf(parts: readonly string[]): readonly string[] | undefined {
    const nameLength = parts[0]?.startsWith(SCOPE_PREFIX) === true ? 2 : 1;
    return parts.length < nameLength ? undefined : parts.slice(0, nameLength);
}

/** By the last `node_modules`, so a nested copy has its own place; `undefined` outside every one. */
export function installedPlaceOf(path: string): InstalledPlace | undefined {
    const segments = path.split("/");
    const nodeModules = segments.lastIndexOf(NODE_MODULES);
    if (nodeModules === -1) {
        return undefined;
    }
    return {
        dir: segments.slice(0, nodeModules + 1).join("/"),
        name: packageNamePartsOf(segments.slice(nodeModules + 1))?.join("/") ?? "",
    };
}

/** A package's name as its installed place spells it, else the folder's own name. */
export function installedPackageNameOf(id: string): string {
    return installedPlaceOf(id)?.name ?? id.slice(id.lastIndexOf("/") + 1);
}

export function nodeModulesDirOf(dir: string): string {
    return joinWorkspacePath(dir, NODE_MODULES);
}
