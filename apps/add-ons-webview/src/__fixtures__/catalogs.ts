import type {
    AddOnCatalogPayload,
    AddOnSourcePayload,
    CodeAddOnPayload,
    TemplateAddOnPayload,
} from "@miragon/bpmn-modeler-shared";

export const RESIZE: CodeAddOnPayload = {
    id: "plugin:/work/.camunda/plugins/resize",
    kind: "plugin",
    kindText: "BPMN plugin",
    name: "Resize Tasks",
    detail: "plugins/resize",
    state: "new",
    stateText: "Not allowed yet",
    review: {
        heading: "Review Resize Tasks before you allow it",
        warning: "Plugin risk. Allow it only if you trust it.",
        facts: [
            { label: "Folder", value: ".camunda/plugins/resize" },
            { label: "Content hash", value: "ab12" },
        ],
    },
    actions: [{ kind: "allow", label: "Allow this content" }],
};

export const PALETTE: CodeAddOnPayload = {
    id: "plugin:/work/.camunda/plugins/palette",
    kind: "plugin",
    kindText: "BPMN plugin",
    name: "Palette",
    state: "approved",
    stateText: "Allowed",
    actions: [{ kind: "revoke", label: "Revoke" }],
};

export const ACME: CodeAddOnPayload = {
    id: "rulePackage:/work/node_modules/bpmnlint-plugin-acme",
    kind: "rulePackage",
    kindText: "bpmnlint rule package",
    name: "bpmnlint-plugin-acme",
    state: "new",
    stateText: "Not allowed yet",
    actions: [{ kind: "inspect", label: "Review…" }],
};

export const MAIL: TemplateAddOnPayload = {
    id: "template:marketplace:shared|mail.json#0:mail@1",
    kind: "elementTemplate",
    kindText: "Element template",
    name: "Mail",
    state: "enabled",
    stateText: "Enabled",
    actions: [{ kind: "disable", label: "Disable" }],
};

export const CONFIG_SOURCE: AddOnSourcePayload = {
    id: "config:/work/.camunda",
    kind: "configFolder",
    label: ".camunda",
    description: "Applies to every diagram in this folder",
    actions: [],
    addOns: [PALETTE, RESIZE],
};

export const PACKAGES_SOURCE: AddOnSourcePayload = {
    id: "packages:/work/node_modules",
    kind: "installedPackages",
    label: "node_modules",
    description: "Installed packages",
    actions: [],
    addOns: [ACME],
};

export const MARKETPLACE_SOURCE: AddOnSourcePayload = {
    id: "marketplace:shared",
    kind: "marketplace",
    label: "/shared",
    description: "Registered for all projects",
    actions: [
        { kind: "removeMarketplace", label: "Remove" },
        { kind: "disableTemplates", label: "Disable templates" },
    ],
    addOns: [MAIL],
};

/** One folder with plugins and a rule package, then a marketplace with one template. */
export const CATALOG: AddOnCatalogPayload = {
    revision: 10,
    groups: [
        {
            id: "folder:/work",
            kind: "folder",
            label: "work",
            description: "/work",
            sources: [CONFIG_SOURCE, PACKAGES_SOURCE],
        },
        {
            id: "marketplaces",
            kind: "marketplaces",
            label: "Marketplaces",
            description: "Element templates fetched from the registered marketplaces",
            sources: [MARKETPLACE_SOURCE],
        },
    ],
    actions: [
        { kind: "addMarketplace", label: "Add marketplace…" },
        { kind: "pruneCache", label: "Remove unused plugin copies" },
    ],
};

export function withRevision(revision: number, model = CATALOG): AddOnCatalogPayload {
    return { ...model, revision };
}

/** The catalog without the add-on of this id. */
export function without(addOnId: string, model = CATALOG): AddOnCatalogPayload {
    return {
        ...model,
        groups: model.groups.map((group) => ({
            ...group,
            sources: group.sources.map((source) => ({
                ...source,
                addOns: source.addOns.filter(({ id }) => id !== addOnId),
            })),
        })),
    };
}
