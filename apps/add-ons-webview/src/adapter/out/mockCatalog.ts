import type {
    ActionViewPayload,
    AddOnActionResultPayload,
    AddOnCatalogPayload,
    AddOnGroupPayload,
    AddOnPayload,
    AddOnRequestPayload,
    AddOnReviewPayload,
    AddOnSourcePayload,
    CodeAddOnPayload,
    TemplateAddOnPayload,
} from "@miragon/bpmn-modeler-shared";

import { needsReview } from "../../domain/catalogFilter";

/*
 * The preview's catalog: one row in every state a view can show. The texts
 * copy the core's so the preview reads like a host; the core stays their home.
 */

const ALLOW = { kind: "allow", label: "Allow" } as const;
const REVOKE = { kind: "revoke", label: "Revoke" } as const;
const ENABLE = { kind: "enable", label: "Enable" } as const;
const DISABLE = { kind: "disable", label: "Disable" } as const;
const ENABLE_TEMPLATES = { kind: "enableTemplates", label: "Enable templates" } as const;
const DISABLE_TEMPLATES = { kind: "disableTemplates", label: "Disable templates" } as const;
const TEMPLATE_SWITCHES: readonly ActionViewPayload<string>[] = [ENABLE_TEMPLATES, DISABLE_TEMPLATES];
const SOURCE_DISABLED_NOTE = "Its source is disabled.";
const PLUGIN_RISK = "A plugin runs its own code in the BPMN editor.";
const RULE_RISK = "A rule package runs as a program with your user's rights, not only inside the editor.";
const RISK: Record<CodeAddOnPayload["kind"], string> = { plugin: PLUGIN_RISK, rulePackage: RULE_RISK };
const FOLLOW_UP: Record<CodeAddOnPayload["kind"], { readonly allowed: string; readonly revoked: string }> = {
    plugin: { allowed: "Open editors reload with it.", revoked: "Open editors reload without it." },
    rulePackage: {
        allowed: "Open editors lint again with it.",
        revoked: "Code it already ran stays loaded until you reload the window.",
    },
};

const IN_REPOSITORY = " in every worktree of its repository";

// A rule package's name carries its version, as the core labels it.
const VERSION_OF: Record<CodeAddOnPayload["kind"], (name: string) => string | undefined> = {
    plugin: () => undefined,
    rulePackage: (name) => (name.lastIndexOf("@") > 0 ? name.slice(name.lastIndexOf("@") + 1) : undefined),
};

// A revoked plugin unloads at once; code a revoked rule package ran stays loaded.
const NOTE_AFTER_REVOKE: Record<CodeAddOnPayload["kind"], string | undefined> = {
    plugin: undefined,
    rulePackage: FOLLOW_UP.rulePackage.revoked,
};

function reviewOf(name: string, risk: string, folder: string, version?: string): AddOnReviewPayload {
    return {
        heading: `Review ${name} before you allow it`,
        warning: `${risk} Allowing it covers it in every worktree of this repository, later changes included. Allow it only if you trust it.`,
        facts: [
            { label: "Folder", value: folder },
            ...(version === undefined ? [] : [{ label: "Version", value: version }]),
            { label: "Allowed in", value: "every worktree of /work" },
        ],
    };
}

function plugin(
    name: string,
    folder: string,
    state: CodeAddOnPayload["state"],
    extra: Partial<CodeAddOnPayload> = {},
): CodeAddOnPayload {
    const allowable = ALLOWABLE[state];
    return {
        id: `plugin:/work/${folder}`,
        kind: "plugin",
        kindText: "BPMN plugin",
        name,
        detail: folder.replace(/^\.camunda\//, ""),
        state,
        stateText: STATE_TEXT[state],
        ...(allowable && { review: reviewOf(name, PLUGIN_RISK, folder) }),
        actions: allowable ? [ALLOW] : [REVOKE],
        ...extra,
    };
}

function template(
    name: string,
    file: string,
    state: TemplateAddOnPayload["state"],
    extra: Partial<TemplateAddOnPayload> = {},
): TemplateAddOnPayload {
    return {
        id: `template:${file}#0:${name}@1`,
        kind: "elementTemplate",
        kindText: "Element template",
        name,
        detail: "Version 1",
        engineText: "Camunda 8",
        state,
        stateText: state === "enabled" ? "Enabled" : "Disabled",
        actions: [state === "enabled" ? DISABLE : ENABLE],
        ...extra,
    };
}

const ALLOWABLE: Record<CodeAddOnPayload["state"], boolean> = {
    approved: false,
    new: true,
    declined: true,
};

const STATE_TEXT: Record<CodeAddOnPayload["state"], string> = {
    approved: "Allowed",
    new: "Not allowed yet",
    declined: "Declined this session",
};

function fullCatalog(): AddOnGroupPayload[] {
    return [
        {
            id: "folder:/work",
            kind: "folder",
            label: "work",
            description: "/work",
            sources: [
                {
                    id: "config:/work/.camunda",
                    kind: "configFolder",
                    label: ".camunda",
                    description: "Applies to every diagram in this folder",
                    actions: [DISABLE_TEMPLATES],
                    addOns: [
                        plugin("Palette", ".camunda/plugins/palette", "approved"),
                        plugin("Resize Tasks", ".camunda/plugins/resize", "new"),
                        plugin("Lasso", ".camunda/plugins/lasso", "declined"),
                        plugin("broken", ".camunda/plugins/broken", "approved", {
                            problem: "Cannot be allowed: plugin.json is not valid JSON.",
                        }),
                        template("Mail Task", "config:/work/.camunda|mail.json", "enabled"),
                        template("Legacy Task", "config:/work/.camunda|legacy.json", "disabled"),
                        template("broken.json", "config:/work/.camunda|broken.json", "enabled", {
                            problem: "Cannot be read: Unexpected token } in JSON.",
                            actions: [],
                        }),
                    ],
                },
                {
                    id: "config:/work/orders/.camunda",
                    kind: "configFolder",
                    label: "orders/.camunda",
                    description: "Applies to diagrams below orders/",
                    stateText: "Templates disabled",
                    actions: [ENABLE_TEMPLATES],
                    addOns: [
                        template("Order Task", "config:/work/orders/.camunda|order.json", "disabled", {
                            note: SOURCE_DISABLED_NOTE,
                            actions: [],
                        }),
                    ],
                },
                {
                    id: "packages:/work/node_modules",
                    kind: "installedPackages",
                    label: "node_modules",
                    description: "Installed packages",
                    actions: [],
                    addOns: [
                        {
                            id: "rulePackage:/work/node_modules/bpmnlint-plugin-acme",
                            kind: "rulePackage",
                            kindText: "bpmnlint rule package",
                            name: "bpmnlint-plugin-acme@1.0.0",
                            state: "approved",
                            stateText: STATE_TEXT.approved,
                            actions: [REVOKE],
                        },
                        {
                            id: "rulePackage:/work/node_modules/@acme/bpmnlint-plugin-rules",
                            kind: "rulePackage",
                            kindText: "bpmnlint rule package",
                            name: "@acme/bpmnlint-plugin-rules@2.1.0",
                            state: "new",
                            stateText: STATE_TEXT.new,
                            note: FOLLOW_UP.rulePackage.revoked,
                            review: reviewOf(
                                "@acme/bpmnlint-plugin-rules@2.1.0",
                                RULE_RISK,
                                "node_modules/@acme/bpmnlint-plugin-rules",
                                "2.1.0",
                            ),
                            actions: [ALLOW],
                        },
                    ],
                },
            ],
        },
        {
            id: "folder:/billing",
            kind: "folder",
            label: "billing",
            description: "/billing",
            sources: [
                {
                    id: "config:/billing/.camunda",
                    kind: "configFolder",
                    label: ".camunda",
                    description: "Applies to every diagram in this folder",
                    actions: [],
                    addOns: [plugin("Billing Palette", ".camunda/plugins/billing-palette", "approved")],
                },
            ],
        },
        {
            id: "marketplaces",
            kind: "marketplaces",
            label: "Marketplaces",
            description: "Element templates fetched from the registered marketplaces",
            sources: [
                {
                    id: "marketplace:shared",
                    kind: "marketplace",
                    label: "/shared",
                    description: "Registered for all projects",
                    actions: [{ kind: "removeMarketplace", label: "Remove" }, DISABLE_TEMPLATES],
                    addOns: [template("Shared Mail", "marketplace:shared|mail.json", "enabled")],
                },
                {
                    id: "marketplace:broken",
                    kind: "marketplace",
                    label: "https://example.com/broken",
                    description: "Registered for this project",
                    problem: "Could not fetch the marketplace: 404 Not Found.",
                    actions: [{ kind: "removeMarketplace", label: "Remove" }],
                    addOns: [],
                },
            ],
        },
    ];
}

const CATALOG_ACTIONS: AddOnCatalogPayload["actions"] = [
    { kind: "addMarketplace", label: "Add marketplace…" },
    { kind: "updateMarketplaces", label: "Update marketplaces" },
    { kind: "pruneCache", label: "Remove unused plugin copies" },
];

const PREVIEW_STATES = [
    "full",
    "allReviewed",
    "loading",
    "empty",
    "noFolder",
    "onlyMarketplaces",
    "noMarketplace",
    "marketplacesFailed",
    "rereadFailed",
    "failed",
] as const;

type PreviewState = (typeof PREVIEW_STATES)[number];

/** The preview state a URL names; the full catalog for any other name. */
export function previewStateOf(name: string | null): PreviewState {
    return PREVIEW_STATES.find((state) => state === name) ?? "full";
}

function allowed(row: CodeAddOnPayload): CodeAddOnPayload {
    return { ...row, state: "approved", stateText: STATE_TEXT.approved, review: undefined, note: undefined, actions: [REVOKE] };
}

function everyCodeAllowed(groups: AddOnGroupPayload[]): AddOnGroupPayload[] {
    return groups.map((group) => ({
        ...group,
        sources: group.sources.map((source) => ({
            ...source,
            addOns: source.addOns.map((row) => (row.kind !== "elementTemplate" && needsReview(row) ? allowed(row) : row)),
        })),
    }));
}

const NO_ADD_ON_TEXT = "No BPMN plugins, bpmnlint rule packages or element templates in this workspace.";
const NO_FOLDER_TEXT = "Open a folder to see the plugins, rule packages and element templates it brings.";

const folderGroups = () => fullCatalog().filter(({ kind }) => kind === "folder");
const marketplacesGroup = () => fullCatalog().filter(({ kind }) => kind === "marketplaces");

const GROUPS_OF: Record<PreviewState, () => Partial<AddOnCatalogPayload> | undefined> = {
    full: () => ({ groups: fullCatalog() }),
    allReviewed: () => ({ groups: everyCodeAllowed(fullCatalog()) }),
    loading: () => undefined,
    empty: () => ({ groups: [], emptyText: NO_ADD_ON_TEXT }),
    noFolder: () => ({ groups: [], emptyText: NO_FOLDER_TEXT }),
    onlyMarketplaces: () => ({ groups: marketplacesGroup(), emptyText: NO_FOLDER_TEXT }),
    noMarketplace: () => ({ groups: folderGroups() }),
    marketplacesFailed: () => ({
        groups: [
            ...folderGroups(),
            { ...marketplacesGroup()[0]!, problem: "Could not read the registered marketplaces.", sources: [] },
        ],
    }),
    rereadFailed: () => ({
        groups: fullCatalog(),
        problem: "Could not list the add-ons again. The list shows what it read before; the log says why.",
    }),
    failed: () => ({ groups: [], actions: [], problem: "Could not list the add-ons. The log says why." }),
};

type Done = { readonly result: AddOnActionResultPayload; readonly changed: boolean };

/** What the preview's host holds and changes, as the core's catalog would. */
export class MockCatalog {
    private revision = 1;
    private groups: AddOnGroupPayload[];
    private parts: Partial<AddOnCatalogPayload> | undefined;
    private staleOnce: boolean;

    constructor(state: PreviewState, options: { readonly stale?: boolean } = {}) {
        this.parts = GROUPS_OF[state]();
        this.groups = [...(this.parts?.groups ?? [])];
        this.staleOnce = options.stale ?? false;
    }

    /** `undefined` while the preview shows a catalog that never arrives. */
    model(): AddOnCatalogPayload | undefined {
        if (this.parts === undefined) return undefined;
        return { actions: CATALOG_ACTIONS, ...this.parts, revision: this.revision, groups: this.groups };
    }

    idOf(nameOrId: string): string | undefined {
        return this.rows().find((row) => row.id === nameOrId || row.name === nameOrId)?.id;
    }

    act(request: AddOnRequestPayload): Done {
        const done = this.actOn(request);
        if (done.changed) this.revision++;
        return done;
    }

    private actOn(request: AddOnRequestPayload): Done {
        switch (request.kind) {
            case "allow":
                return this.allow(request.addOnId);
            case "revoke":
                return this.revoke(request.addOnId);
            case "enable":
            case "disable":
                return this.changeRow<TemplateAddOnPayload>(request.addOnId, (row) =>
                    template(row.name, row.id.slice("template:".length).split("#")[0], request.kind === "enable" ? "enabled" : "disabled", { id: row.id }),
                );
            case "enableTemplates":
            case "disableTemplates":
                return this.switchSource(request.sourceId, request.kind === "disableTemplates");
            case "removeMarketplace":
                this.groups = this.groups.map((group) => ({
                    ...group,
                    sources: group.sources.filter(({ id }) => id !== request.sourceId),
                }));
                return { result: { kind: "reportedByFlow" }, changed: true };
            case "addMarketplace":
            case "updateMarketplaces":
                return { result: { kind: "reportedByFlow" }, changed: false };
            case "pruneCache":
                return { result: { kind: "done", message: "Removed 2 unused plugin copies." }, changed: false };
            case "refresh":
                return { result: { kind: "done" }, changed: true };
        }
    }

    private allow(addOnId: string): Done {
        if (this.staleOnce) {
            this.staleOnce = false;
            return {
                result: {
                    kind: "refused",
                    reason: "staleView",
                    message: "The list changed since you looked at it. Check it again.",
                },
                changed: true,
            };
        }
        return this.changeRow<CodeAddOnPayload>(
            addOnId,
            allowed,
            (row) => `Allowed ${row.name}${IN_REPOSITORY}. ${FOLLOW_UP[row.kind].allowed}`,
        );
    }

    private revoke(addOnId: string): Done {
        return this.changeRow<CodeAddOnPayload>(
            addOnId,
            (each) => ({
                ...each,
                state: "new",
                stateText: STATE_TEXT.new,
                ...(NOTE_AFTER_REVOKE[each.kind] !== undefined && { note: NOTE_AFTER_REVOKE[each.kind] }),
                ...(each.problem === undefined && {
                    review: reviewOf(
                        each.name,
                        RISK[each.kind],
                        each.id.replace(/^\w+:\/work\//, ""),
                        VERSION_OF[each.kind](each.name),
                    ),
                }),
                actions: each.problem === undefined ? [ALLOW] : [],
            }),
            (each) => `Revoked ${each.name}${IN_REPOSITORY}. ${FOLLOW_UP[each.kind].revoked}`,
        );
    }

    private switchSource(sourceId: string, disable: boolean): Done {
        this.groups = this.groups.map((group) => ({
            ...group,
            sources: group.sources.map((source): AddOnSourcePayload => {
                if (source.id !== sourceId) return source;
                const { stateText: _stateText, ...rest } = source;
                return {
                    ...rest,
                    ...(disable && { stateText: "Templates disabled" }),
                    actions: source.actions.map((action) =>
                        TEMPLATE_SWITCHES.includes(action) ? (disable ? ENABLE_TEMPLATES : DISABLE_TEMPLATES) : action,
                    ),
                    addOns: source.addOns.map((addOn) =>
                        addOn.kind !== "elementTemplate"
                            ? addOn
                            : disable
                              ? { ...addOn, note: SOURCE_DISABLED_NOTE, actions: [] }
                              : template(addOn.name, addOn.id.slice("template:".length).split("#")[0], addOn.state, { id: addOn.id }),
                    ),
                };
            }),
        }));
        return { result: { kind: "done" }, changed: true };
    }

    private changeRow<R extends AddOnPayload>(
        addOnId: string,
        change: (row: R) => R,
        message?: (row: R) => string,
    ): Done {
        const row = this.rows().find(({ id }) => id === addOnId) as R | undefined;
        if (row === undefined) {
            return {
                result: { kind: "refused", reason: "unknownAddOn", message: "This add-on is no longer listed." },
                changed: false,
            };
        }
        this.groups = this.groups.map((group) => ({
            ...group,
            sources: group.sources.map((source) => ({
                ...source,
                addOns: source.addOns.map((each) => (each.id === addOnId ? change(each as R) : each)),
            })),
        }));
        return { result: { kind: "done", ...(message && { message: message(row) }) }, changed: true };
    }

    private rows(): AddOnPayload[] {
        return this.groups.flatMap((group) => group.sources.flatMap((source) => source.addOns));
    }
}
