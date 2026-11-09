/** Templates join the code add-ons once they can be turned off. */
export const ADD_ON_KINDS = ["plugin", "rulePackage"] as const;

export type AddOnKind = (typeof ADD_ON_KINDS)[number];

export const SOURCE_KINDS = ["configFolder", "installedPackages"] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

const ADD_ON_ID_PREFIX: Record<AddOnKind, string> = {
    plugin: "plugin",
    rulePackage: "rulePackage",
};

const SOURCE_ID_PREFIX: Record<SourceKind, string> = {
    configFolder: "config",
    installedPackages: "packages",
};

/**
 * Ids name what the core showed and are only looked up in what it recorded,
 * never parsed, so a view cannot make the core act on a path of its own.
 */
export function addOnIdOf(kind: AddOnKind, id: string): string {
    return `${ADD_ON_ID_PREFIX[kind]}:${id}`;
}

export function sourceIdOf(kind: SourceKind, dir: string): string {
    return `${SOURCE_ID_PREFIX[kind]}:${dir}`;
}

export function folderGroupIdOf(root: string): string {
    return `folder:${root}`;
}
