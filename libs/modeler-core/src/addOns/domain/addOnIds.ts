import { ALLOWANCE_KINDS } from "../../kernel/domain/approvalRowKind";

/** The add-ons that run code, which a user allows and revokes. */
export const CODE_ADD_ON_KINDS = ALLOWANCE_KINDS;

export type CodeAddOnKind = (typeof CODE_ADD_ON_KINDS)[number];

export const ADD_ON_KINDS = [...CODE_ADD_ON_KINDS, "elementTemplate"] as const;

export type AddOnKind = (typeof ADD_ON_KINDS)[number];

export const SOURCE_KINDS = ["configFolder", "installedPackages", "marketplace"] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

export const GROUP_KINDS = ["folder", "marketplaces"] as const;

export type GroupKind = (typeof GROUP_KINDS)[number];

/** Whether new elements offer a template; one that is used keeps applying either way. */
export const TEMPLATE_STATES = ["enabled", "disabled"] as const;

export type TemplateState = (typeof TEMPLATE_STATES)[number];

/** The state the add-ons view shows a code add-on in. */
export type CodeState = "approved" | "new" | "declined";

export const ADD_ON_ACTION_KINDS = ["allow", "revoke", "enable", "disable"] as const;

export type AddOnActionKind = (typeof ADD_ON_ACTION_KINDS)[number];

export type TemplateActionKind = Extract<AddOnActionKind, "enable" | "disable">;

/** "templates", as a config folder source holds plugins too. */
export const SOURCE_ACTION_KINDS = [
    "removeMarketplace",
    "enableTemplates",
    "disableTemplates",
] as const;

export type SourceActionKind = (typeof SOURCE_ACTION_KINDS)[number];

export type TemplateSourceActionKind = Extract<
    SourceActionKind,
    "enableTemplates" | "disableTemplates"
>;

export const CATALOG_ACTION_KINDS = ["addMarketplace", "updateMarketplaces", "pruneCache"] as const;

export type CatalogActionKind = (typeof CATALOG_ACTION_KINDS)[number];

export const MARKETPLACES_GROUP_ID = "marketplaces";

const ADD_ON_ID_PREFIX: Record<AddOnKind, string> = {
    plugin: "plugin",
    rulePackage: "rulePackage",
    elementTemplate: "template",
};

const SOURCE_ID_PREFIX: Record<SourceKind, string> = {
    configFolder: "config",
    installedPackages: "packages",
    marketplace: "marketplace",
};

/**
 * Ids name what the core showed and are only looked up in what it recorded,
 * never parsed, so a view cannot make the core act on a path of its own.
 */
export function addOnIdOf(kind: CodeAddOnKind, id: string): string {
    return `${ADD_ON_ID_PREFIX[kind]}:${id}`;
}

/**
 * A template by its source, file, place in the file, id and version, as a
 * file may repeat an id or leave it out, and one marketplace cache file is
 * listed under every entry that shares its slot; a file it cannot read by its
 * source and the file alone.
 */
export function templateAddOnIdOf(
    sourceId: string,
    file: string,
    template?: { readonly id?: string; readonly version?: number },
    index = 0,
): string {
    const fileId = `${ADD_ON_ID_PREFIX.elementTemplate}:${sourceId}|${file}`;
    if (template === undefined) {
        return fileId;
    }
    const id = template.id === undefined ? "" : `:${template.id}`;
    const version = template.version === undefined ? "" : `@${template.version}`;
    return `${fileId}#${index}${id}${version}`;
}

/** @param key a source's folder, or a marketplace's entry key */
export function sourceIdOf(kind: SourceKind, key: string): string {
    return `${SOURCE_ID_PREFIX[kind]}:${key}`;
}

export function folderGroupIdOf(root: string): string {
    return `folder:${root}`;
}
