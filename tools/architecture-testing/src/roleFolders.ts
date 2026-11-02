export type Role =
    "domain" | "port" | "service" | "adapter/in" | "adapter/out" | "composition" | "testing";

export interface RoleLocation {
    /** The path before the role folder; empty for a role folder at the root. */
    readonly context: string;
    readonly role: Role;
}

const SINGLE_FOLDER_ROLES: readonly Role[] = [
    "domain",
    "port",
    "service",
    "composition",
    "testing",
];
const ADAPTER_ROLES: ReadonlyMap<string, Role> = new Map([
    ["in", "adapter/in"],
    ["out", "adapter/out"],
]);

/** The first role folder of the path decides; the layout below it is free. */
export function roleOf(path: string): RoleLocation | undefined {
    const folders = path.split("/").slice(0, -1);
    for (const [index, folder] of folders.entries()) {
        const role =
            SINGLE_FOLDER_ROLES.find((candidate) => candidate === folder) ??
            (folder === "adapter" ? ADAPTER_ROLES.get(folders[index + 1] ?? "") : undefined);
        if (role !== undefined) {
            return { context: folders.slice(0, index).join("/"), role };
        }
    }
    return undefined;
}

/** A file directly in the source root, such as `index.ts` or `main.ts`. */
export function isEntry(path: string): boolean {
    return !path.includes("/");
}
