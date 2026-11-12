import { describe, expect, it } from "vitest";

import {
    Allowance,
    allowanceKeyOf,
    allowanceOf,
    allowanceRowOf,
} from "../../kernel/domain/allowance";
import { AllowanceKind, approvalRowsOf } from "../../kernel/domain/approvalRowKind";
import {
    ApprovableCodeTexts,
    CodeApproval,
    PROCESS_RESTARTS,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import { ListedPresence, presenceIdOf } from "../../kernel/domain/listedCode";
import { FolderTemplateFileListing } from "../../kernel/domain/templateListing";
import {
    NO_TEMPLATE_PREFERENCES,
    type TemplatePreferencesByScope,
    type TemplateSwitch,
} from "../../kernel/domain/templatePreferences";
import { AddOnFacts, catalogModelOf, failedCatalogOf } from "./addOnCatalog";
import { UNTRUSTED_WORKSPACE_TEXT } from "./addOnTexts";
import { AddOnSession } from "./codeAddOnCatalog";
import { ListedMarketplace } from "./templateAddOnViews";
import type { AddOnView, CodeAddOnView } from "./addOnCatalogModel";

const RESIZE = "/work/.camunda/plugins/resize";
const PALETTE = "/work/.camunda/plugins/palette";
const NESTED = "/work/orders/.camunda/plugins/order-tools";
const ACME = "/work/node_modules/bpmnlint-plugin-acme";
const RULES = "/work/node_modules/@acme/bpmnlint-plugin-rules";
const OTHER_RULES = "/other/node_modules/bpmnlint-plugin-other";
const PLUGIN_HASH = "0123456789abcdef".repeat(4);

const inFolder = (kind: AllowanceKind, id: string): Allowance =>
    allowanceOf(kind, id, { kind: "noRepository" }, "");
const inRepository = (kind: AllowanceKind, id: string, host = ""): Allowance =>
    allowanceOf(
        kind,
        id,
        { kind: "repository", commonDir: "/work/.git", worktreeRoot: "/work" },
        host,
    );

const plugin = (id: string, name: string, allowance = inFolder("plugin", id)): ListedPresence => ({
    kind: "found",
    name,
    artifact: { id, name, allowance },
});

/** Named as the owner names it: `name@version`. */
const rulePackage = (
    id: string,
    name: string,
    version?: string,
    allowance = inFolder("rulePackage", id),
): ListedPresence => ({
    kind: "found",
    name: version === undefined ? name : `${name}@${version}`,
    artifact: { id, name, allowance, ...(version === undefined ? {} : { version }) },
});

const unreadable = (kind: AllowanceKind, id: string, name: string): ListedPresence => ({
    kind: "unreadable",
    id,
    name,
    reason: "it is broken",
    allowance: inFolder(kind, id),
});

const PLUGIN_TEXTS: ApprovableCodeTexts = {
    risk: "Plugin risk.",
    allowedFollowUp: "Plugin follow-up.",
    revokedFollowUp: () => "Plugin revoked.",
};
const RULE_PACKAGE_TEXTS: ApprovableCodeTexts = {
    risk: "A rule package runs as a program with your user's rights, not only inside the editor.",
    allowedFollowUp: "Rule package follow-up.",
    revokedFollowUp: (restart) => `Rule package revoked until ${restart}.`,
};

/** Placed as the owners place them: a plugin in its config folder, a rule package in its `node_modules`. */
const pluginSourceDirOf = (id: string) => id.slice(0, id.lastIndexOf("/plugins/")) || "/";
const rulePackageSourceDirOf = (id: string) =>
    id.includes("/node_modules/")
        ? id.slice(0, id.lastIndexOf("/node_modules/") + "/node_modules".length)
        : id;

function factsOf(
    overrides: Partial<
        Omit<AddOnFacts, "plugins" | "rulePackages" | "marketplaces" | "approvalsByKind">
    > & {
        approvals?: readonly CodeApproval[];
        marketplaces?: readonly ListedMarketplace[];
        plugins?: ListedPresence[];
        rulePackages?: ListedPresence[];
    } = {},
): AddOnFacts {
    const { plugins = [], rulePackages = [], marketplaces, approvals = [], ...rest } = overrides;
    const placedBy =
        (sourceDirOf: (id: string) => string, texts: ApprovableCodeTexts) =>
        (presence: ListedPresence) => ({
            presence,
            sourceDir: sourceDirOf(presenceIdOf(presence)),
            texts,
        });
    return {
        folders: ["/work"],
        configFolder: ".camunda",
        trusted: true,
        approvalsByKind: {
            plugin: approvalRowsOf("plugin", approvals),
            rulePackage: approvalRowsOf("rulePackage", approvals),
        },
        templates: [],
        ...rest,
        ...(marketplaces && { marketplaces: { kind: "listed", sources: marketplaces } }),
        plugins: plugins.map(placedBy(pluginSourceDirOf, PLUGIN_TEXTS)),
        rulePackages: rulePackages.map(placedBy(rulePackageSourceDirOf, RULE_PACKAGE_TEXTS)),
    };
}

function sessionOf(
    overrides: {
        plugin?: [string, SessionAnswer][];
        rulePackage?: [string, SessionAnswer][];
        stillLoaded?: { plugin?: string[]; rulePackage?: string[] };
    } = {},
): AddOnSession {
    return {
        answers: {
            plugin: new Map(overrides.plugin ?? []),
            rulePackage: new Map(overrides.rulePackage ?? []),
        },
        stillLoaded: {
            plugin: new Set(overrides.stillLoaded?.plugin ?? []),
            rulePackage: new Set(overrides.stillLoaded?.rulePackage ?? []),
        },
    };
}

const build = (facts: AddOnFacts, session = sessionOf(), revision = 1) =>
    catalogModelOf(facts, session, "reloadWindow", revision);

const rows = (facts: AddOnFacts, session = sessionOf()): AddOnView[] =>
    build(facts, session).model.groups.flatMap(({ sources }) =>
        sources.flatMap(({ addOns }) => addOns),
    );

const onlyRow = (facts: AddOnFacts, session = sessionOf()): AddOnView => {
    const [row, ...more] = rows(facts, session);
    if (row === undefined || more.length > 0) throw new Error("expected one row");
    return row;
};

const asCode = (row: AddOnView): CodeAddOnView => {
    if (row.kind === "elementTemplate") throw new Error("expected a code row");
    return row;
};

const allowedRow = (presence: ListedPresence): CodeApproval => {
    const allowance =
        presence.kind === "found"
            ? presence.artifact.allowance
            : presence.kind === "unreadable"
              ? presence.allowance
              : undefined;
    if (allowance === undefined) throw new Error("expected an allowance");
    return allowanceRowOf(allowance);
};

describe("catalogModelOf", () => {
    it("groups add-ons by the innermost workspace folder, in the order the folders were opened", () => {
        const { model } = build(
            factsOf({
                folders: ["/work", "/other", "/work/orders"],
                plugins: [plugin(RESIZE, "Resize"), plugin(NESTED, "Order Tools")],
                rulePackages: [rulePackage(OTHER_RULES, "bpmnlint-plugin-other")],
            }),
        );

        expect(
            model.groups.map(({ id, kind, label, description, sources }) => ({
                id,
                kind,
                label,
                description,
                addOns: sources.flatMap(({ addOns }) => addOns.map(({ name }) => name)),
            })),
        ).toEqual([
            {
                id: "folder:/work",
                kind: "folder",
                label: "work",
                description: "/work",
                addOns: ["Resize"],
            },
            {
                id: "folder:/other",
                kind: "folder",
                label: "other",
                description: "/other",
                addOns: ["bpmnlint-plugin-other"],
            },
            {
                id: "folder:/work/orders",
                kind: "folder",
                label: "orders",
                description: "/work/orders",
                addOns: ["Order Tools"],
            },
        ]);
    });

    it("lists nothing outside every workspace folder", () => {
        const { model, shown } = build(
            factsOf({
                plugins: [plugin("/elsewhere/.camunda/plugins/x", "X")],
                rulePackages: [rulePackage("/elsewhere/node_modules/bpmnlint-plugin-x", "x")],
            }),
        );

        expect(model.groups).toEqual([]);
        expect(shown.size).toBe(0);
    });

    it("lists no gone place, which only an allow reading it again reports", () => {
        const { model, shown } = build(
            factsOf({
                plugins: [{ kind: "gone", id: RESIZE, name: "resize" }],
                approvals: [{ pluginId: RESIZE, contentHash: PLUGIN_HASH }],
            }),
        );

        expect(model.groups).toEqual([]);
        expect(shown.size).toBe(0);
    });

    it("puts each add-on in its source: config folders first, the root's leading, then packages", () => {
        const { model } = build(
            factsOf({
                plugins: [plugin(NESTED, "Order Tools"), plugin(RESIZE, "Resize")],
                rulePackages: [rulePackage(ACME, "bpmnlint-plugin-acme", "1.2.0")],
            }),
        );

        expect(
            model.groups[0].sources.map(({ id, kind, label, description }) => ({
                id,
                kind,
                label,
                description,
            })),
        ).toEqual([
            {
                id: "config:/work/.camunda",
                kind: "configFolder",
                label: ".camunda",
                description: "Applies to every diagram in this folder",
            },
            {
                id: "config:/work/orders/.camunda",
                kind: "configFolder",
                label: "orders/.camunda",
                description: "Applies to diagrams below orders/",
            },
            {
                id: "packages:/work/node_modules",
                kind: "installedPackages",
                label: "node_modules",
                description: "Installed packages",
            },
        ]);
    });

    it("tells where a config folder of several segments applies", () => {
        const { model } = build(
            factsOf({
                configFolder: ".config/camunda",
                plugins: [
                    plugin("/work/orders/.config/camunda/plugins/tools", "Tools"),
                    plugin("/work/.config/camunda/plugins/resize", "Resize"),
                ],
            }),
        );

        expect(
            model.groups[0].sources.map(({ label, description }) => ({ label, description })),
        ).toEqual([
            {
                label: ".config/camunda",
                description: "Applies to every diagram in this folder",
            },
            {
                label: "orders/.config/camunda",
                description: "Applies to diagrams below orders/",
            },
        ]);
    });

    it("sorts the config folders below the root by path", () => {
        const { model } = build(
            factsOf({
                plugins: [
                    plugin("/work/b/.camunda/plugins/x", "X"),
                    plugin("/work/a/.camunda/plugins/y", "Y"),
                    plugin(RESIZE, "Resize"),
                ],
            }),
        );

        expect(model.groups[0].sources.map(({ label }) => label)).toEqual([
            ".camunda",
            "a/.camunda",
            "b/.camunda",
        ]);
    });

    it("sorts a source's add-ons by name, then by id", () => {
        const { model } = build(
            factsOf({
                plugins: [
                    plugin(RESIZE, "Same"),
                    plugin(PALETTE, "Same"),
                    plugin("/work/.camunda/plugins/a", "Alpha"),
                ],
            }),
        );

        expect(model.groups[0].sources[0].addOns.map(({ id }) => id)).toEqual([
            "plugin:/work/.camunda/plugins/a",
            `plugin:${PALETTE}`,
            `plugin:${RESIZE}`,
        ]);
    });

    it("leads with the root's config folder though a nested one sorts before it by path", () => {
        const { model } = build(
            factsOf({
                plugins: [
                    plugin("/work/.archive/.camunda/plugins/x", "X"),
                    plugin(RESIZE, "Resize"),
                ],
            }),
        );

        expect(model.groups[0].sources.map(({ label }) => label)).toEqual([
            ".camunda",
            ".archive/.camunda",
        ]);
    });

    it.each([
        { case: "in order", order: [0, 1, 2, 3] },
        { case: "reversed", order: [3, 2, 1, 0] },
        { case: "shuffled", order: [2, 0, 3, 1] },
    ])("sorts add-ons listed $case by name, then by id", ({ order }) => {
        const listed = [
            plugin("/work/.camunda/plugins/a", "Alpha"),
            plugin("/work/.camunda/plugins/b", "Beta"),
            plugin("/work/.camunda/plugins/c", "Beta"),
            plugin("/work/.camunda/plugins/d", "Gamma"),
        ];

        const { model } = build(factsOf({ plugins: order.map((index) => listed[index]) }));

        expect(model.groups[0].sources[0].addOns.map(({ id }) => id)).toEqual(
            ["a", "b", "c", "d"].map((name) => `plugin:/work/.camunda/plugins/${name}`),
        );
    });

    it("names a filesystem root opened as a folder by its path", () => {
        const { model } = build(
            factsOf({ folders: ["/"], plugins: [plugin("/.camunda/plugins/x", "X")] }),
        );

        expect(model.groups.map(({ label }) => label)).toEqual(["/"]);
    });

    it("names a lint config's own package by its folder", () => {
        const { model } = build(factsOf({ rulePackages: [rulePackage("/work/rules", "rules")] }));

        expect(model.groups[0].sources[0]).toMatchObject({
            id: "packages:/work/rules",
            label: "rules",
        });
    });

    it.each<{
        case: string;
        presence: ListedPresence;
        allowed: boolean;
        declined?: boolean;
        trusted?: boolean;
        state: string;
        stateText: string;
        actions: string[];
        problem?: string;
    }>([
        {
            case: "found code its allowance holds",
            presence: plugin(RESIZE, "Resize"),
            allowed: true,
            state: "approved",
            stateText: "Allowed",
            actions: ["revoke:Revoke"],
        },
        {
            case: "found code not allowed yet",
            presence: plugin(RESIZE, "Resize"),
            allowed: false,
            state: "new",
            stateText: "Not allowed yet",
            actions: ["allow:Allow"],
        },
        {
            case: "found code declined this session",
            presence: plugin(RESIZE, "Resize"),
            allowed: false,
            declined: true,
            state: "declined",
            stateText: "Declined this session",
            actions: ["allow:Allow"],
        },
        {
            case: "unreadable code its allowance holds",
            presence: unreadable("plugin", RESIZE, "resize"),
            allowed: true,
            state: "approved",
            stateText: "Allowed",
            actions: ["revoke:Revoke"],
            problem: "Cannot be allowed: it is broken.",
        },
        {
            case: "unreadable code not allowed yet",
            presence: unreadable("plugin", RESIZE, "resize"),
            allowed: false,
            state: "new",
            stateText: "Not allowed yet",
            actions: [],
            problem: "Cannot be allowed: it is broken.",
        },
        {
            case: "unreadable code declined this session",
            presence: unreadable("plugin", RESIZE, "resize"),
            allowed: false,
            declined: true,
            state: "declined",
            stateText: "Declined this session",
            actions: [],
            problem: "Cannot be allowed: it is broken.",
        },
        {
            case: "found code its allowance holds in a workspace the user did not trust",
            presence: plugin(RESIZE, "Resize"),
            allowed: true,
            trusted: false,
            state: "approved",
            stateText: "Allowed",
            actions: ["revoke:Revoke"],
            problem: UNTRUSTED_WORKSPACE_TEXT,
        },
        {
            case: "found code not allowed yet in a workspace the user did not trust",
            presence: plugin(RESIZE, "Resize"),
            allowed: false,
            trusted: false,
            state: "new",
            stateText: "Not allowed yet",
            actions: [],
            problem: UNTRUSTED_WORKSPACE_TEXT,
        },
        {
            case: "found code declined this session in a workspace the user did not trust",
            presence: plugin(RESIZE, "Resize"),
            allowed: false,
            declined: true,
            trusted: false,
            state: "declined",
            stateText: "Declined this session",
            actions: [],
            problem: UNTRUSTED_WORKSPACE_TEXT,
        },
        {
            case: "unreadable code not allowed yet in a workspace the user did not trust",
            presence: unreadable("plugin", RESIZE, "resize"),
            allowed: false,
            trusted: false,
            state: "new",
            stateText: "Not allowed yet",
            actions: [],
            problem: "Cannot be allowed: it is broken.",
        },
    ])(
        "offers for $case: $actions",
        ({ presence, allowed, declined, trusted = true, state, stateText, actions, problem }) => {
            const key = allowanceKeyOf(inFolder("plugin", RESIZE));
            const row = onlyRow(
                factsOf({
                    plugins: [presence],
                    approvals: allowed ? [allowedRow(presence)] : [],
                    trusted,
                }),
                sessionOf({ plugin: declined ? [[key, "declined"]] : [] }),
            );

            expect({
                state: row.state,
                stateText: row.stateText,
                actions: row.actions.map(({ kind, label }) => `${kind}:${label}`),
                problem: row.problem,
            }).toEqual({ state, stateText, actions, problem });
        },
    );

    it("shows no review of code in a workspace the user did not trust", () => {
        const row = asCode(
            onlyRow(factsOf({ plugins: [plugin(RESIZE, "Resize")], trusted: false })),
        );

        expect(row.review).toBeUndefined();
    });

    it("offers no Review…, no Allow this content and no Forget on any row", () => {
        const labels = rows(
            factsOf({
                plugins: [plugin(RESIZE, "Resize"), unreadable("plugin", PALETTE, "palette")],
                rulePackages: [rulePackage(ACME, "bpmnlint-plugin-acme", "1.0.0")],
                approvals: [allowedRow(unreadable("plugin", PALETTE, "palette"))],
            }),
        ).flatMap((row) => row.actions.map(({ label }) => label));

        expect(labels.sort()).toEqual(["Allow", "Allow", "Revoke"]);
    });

    it("allows the place a local row pinned to content names, and only that place", () => {
        const states = rows(
            factsOf({
                plugins: [plugin(RESIZE, "Resize"), plugin(PALETTE, "Palette")],
                approvals: [{ pluginId: RESIZE, contentHash: PLUGIN_HASH }],
            }),
        ).map(({ name, state }) => `${name}:${state}`);

        expect(states).toEqual(["Palette:new", "Resize:approved"]);
    });

    it("gives two worktrees' rows of one allowance one state", () => {
        const shared = inRepository("plugin", RESIZE);
        const states = (approvals: CodeApproval[]) =>
            rows(
                factsOf({
                    folders: ["/work", "/task"],
                    plugins: [
                        plugin(RESIZE, "Resize", shared),
                        plugin("/task/.camunda/plugins/resize", "Resize", shared),
                    ],
                    approvals,
                }),
            ).map(({ state }) => state);

        expect(states([])).toEqual(["new", "new"]);
        expect(states([allowanceRowOf(shared)])).toEqual(["approved", "approved"]);
    });

    it("keeps code left to the view new", () => {
        const row = onlyRow(
            factsOf({ plugins: [plugin(RESIZE, "Resize")] }),
            sessionOf({ plugin: [[allowanceKeyOf(inFolder("plugin", RESIZE)), "leftForView"]] }),
        );

        expect(row.state).toBe("new");
    });

    it("reads each kind's answers only for that kind", () => {
        const row = onlyRow(
            factsOf({ rulePackages: [rulePackage(ACME, "bpmnlint-plugin-acme")] }),
            sessionOf({
                plugin: [[allowanceKeyOf(inFolder("rulePackage", ACME)), "declined"]],
            }),
        );

        expect(row.state).toBe("new");
    });

    it("names a rule package by name and version, without a detail, and shows what the user allows", () => {
        const row = onlyRow(
            factsOf({ rulePackages: [rulePackage(ACME, "bpmnlint-plugin-acme", "1.2.0")] }),
        );

        expect(row).toEqual(
            expect.objectContaining({
                id: `rulePackage:${ACME}`,
                kind: "rulePackage",
                kindText: "bpmnlint rule package",
                name: "bpmnlint-plugin-acme@1.2.0",
                review: {
                    heading: "Review bpmnlint-plugin-acme@1.2.0 before you allow it",
                    warning:
                        "A rule package runs as a program with your user's rights, not only inside the editor. Allowing it covers this folder, later changes included. Allow it only if you trust it.",
                    facts: [
                        { label: "Folder", value: "node_modules/bpmnlint-plugin-acme" },
                        { label: "Version", value: "1.2.0" },
                        { label: "Allowed in", value: "this folder only" },
                    ],
                },
            }),
        );
        expect(asCode(row).detail).toBeUndefined();
    });

    it.each<{ case: string; allowance: Allowance; warning: string; allowedIn: string }>([
        {
            case: "a plugin in a repository",
            allowance: inRepository("plugin", RESIZE),
            warning:
                "Plugin risk. Allowing it covers it in every worktree of this repository, later changes included. Allow it only if you trust it.",
            allowedIn: "every worktree of /work",
        },
        {
            case: "a plugin in a repository on a remote host",
            allowance: inRepository("plugin", RESIZE, "ssh-remote+box"),
            warning:
                "Plugin risk. Allowing it covers it in every worktree of this repository, later changes included. Allow it only if you trust it.",
            allowedIn: "every worktree of /work on ssh-remote+box",
        },
        {
            case: "a plugin outside every repository",
            allowance: inFolder("plugin", RESIZE),
            warning:
                "Plugin risk. Allowing it covers this folder, later changes included. Allow it only if you trust it.",
            allowedIn: "this folder only",
        },
    ])("reviews $case by where its allowance holds", ({ allowance, warning, allowedIn }) => {
        expect(
            asCode(onlyRow(factsOf({ plugins: [plugin(RESIZE, "Resize", allowance)] }))).review,
        ).toEqual({
            heading: "Review Resize before you allow it",
            warning,
            facts: [
                { label: "Folder", value: ".camunda/plugins/resize" },
                { label: "Allowed in", value: allowedIn },
            ],
        });
    });

    it("shows a plugin's folder as its detail, and no review once it is allowed", () => {
        const presence = plugin(RESIZE, "Resize");
        const row = onlyRow(factsOf({ plugins: [presence], approvals: [allowedRow(presence)] }));

        expect(row).toMatchObject({ kindText: "BPMN plugin", detail: "plugins/resize" });
        expect(asCode(row).review).toBeUndefined();
    });

    it.each(PROCESS_RESTARTS)(
        "notes what follows the revoke of a row whose owner says its code stays loaded, for %s",
        (restart) => {
            const { model } = catalogModelOf(
                factsOf({ rulePackages: [rulePackage(ACME, "bpmnlint-plugin-acme")] }),
                sessionOf({ stillLoaded: { rulePackage: [ACME] } }),
                restart,
                1,
            );

            expect(asCode(model.groups[0].sources[0].addOns[0]).note).toBe(
                `Rule package revoked until ${restart}.`,
            );
        },
    );

    it("notes the loaded code of a row whose allowance key was revoked", () => {
        const row = onlyRow(
            factsOf({ rulePackages: [rulePackage(ACME, "bpmnlint-plugin-acme")] }),
            sessionOf({
                stillLoaded: { rulePackage: [allowanceKeyOf(inFolder("rulePackage", ACME))] },
            }),
        );

        expect(asCode(row).note).toBe("Rule package revoked until reloadWindow.");
    });

    it("notes no loaded code once a row is allowed again, nor for a kind whose owner names none", () => {
        const acme = rulePackage(ACME, "bpmnlint-plugin-acme");
        const facts = factsOf({
            plugins: [plugin(RESIZE, "Resize")],
            rulePackages: [acme],
            approvals: [allowedRow(acme)],
        });

        expect(
            rows(facts, sessionOf({ stillLoaded: { rulePackage: [ACME, RESIZE] } }))
                .map(asCode)
                .map(({ note }) => note),
        ).toEqual([undefined, undefined]);
    });

    it("keeps what it showed of each add-on: its place, allowance and what it offered", () => {
        const acme = rulePackage(ACME, "bpmnlint-plugin-acme", "1.0.0");
        const { shown } = build(
            factsOf({
                plugins: [plugin(RESIZE, "Resize")],
                rulePackages: [acme],
                approvals: [allowedRow(acme)],
            }),
        );

        expect([...shown]).toEqual([
            [
                `plugin:${RESIZE}`,
                {
                    kind: "plugin",
                    id: RESIZE,
                    name: "Resize",
                    allowance: inFolder("plugin", RESIZE),
                    actions: ["allow"],
                    allowedFollowUp: PLUGIN_TEXTS.allowedFollowUp,
                    revokedFollowUp: "Plugin revoked.",
                },
            ],
            [
                `rulePackage:${ACME}`,
                {
                    kind: "rulePackage",
                    id: ACME,
                    name: "bpmnlint-plugin-acme@1.0.0",
                    allowance: inFolder("rulePackage", ACME),
                    actions: ["revoke"],
                    allowedFollowUp: RULE_PACKAGE_TEXTS.allowedFollowUp,
                    revokedFollowUp: "Rule package revoked until reloadWindow.",
                },
            ],
        ]);
    });

    it("gives the same ids to the same add-ons in two builds", () => {
        const facts = factsOf({
            plugins: [plugin(RESIZE, "Resize")],
            rulePackages: [rulePackage(RULES, "@acme/bpmnlint-plugin-rules")],
        });
        const ids = (revision: number) => {
            const { model } = build(facts, sessionOf(), revision);
            return model.groups.flatMap((group) => [
                group.id,
                ...group.sources.flatMap((source) => [
                    source.id,
                    ...source.addOns.map(({ id }) => id),
                ]),
            ]);
        };

        expect(ids(2)).toEqual(ids(1));
        expect(ids(1)).toEqual([
            "folder:/work",
            "config:/work/.camunda",
            `plugin:${RESIZE}`,
            "packages:/work/node_modules",
            `rulePackage:${RULES}`,
        ]);
    });

    it("stamps the revision and offers to remove unused plugin copies", () => {
        const { model } = build(factsOf(), sessionOf(), 7);

        expect([model.revision, model.actions]).toEqual([
            7,
            [{ kind: "pruneCache", label: "Remove unused plugin copies" }],
        ]);
    });

    it.each([
        {
            case: "no folder is open",
            folders: [],
            emptyText:
                "Open a folder to see the plugins, rule packages and element templates it brings.",
        },
        {
            case: "no folder brings an add-on",
            folders: ["/work"],
            emptyText:
                "No BPMN plugins, bpmnlint rule packages or element templates in this workspace.",
        },
    ])("says so when $case", ({ folders, emptyText }) => {
        expect(build(factsOf({ folders })).model.emptyText).toBe(emptyText);
    });

    it("says nothing is empty once one add-on is listed", () => {
        expect(
            build(factsOf({ plugins: [plugin(RESIZE, "Resize")] })).model.emptyText,
        ).toBeUndefined();
    });
});

const TEMPLATES = "/work/.camunda/element-templates";
const NESTED_TEMPLATES = "/work/orders/.camunda/element-templates";

const templateFile = (
    path: string,
    reading: FolderTemplateFileListing["reading"],
): FolderTemplateFileListing => ({
    path,
    sourceDir: path.slice(0, path.lastIndexOf("/element-templates/")),
    reading,
});

const SHARED: ListedMarketplace = {
    id: "acme-shared",
    entry: "https://github.com/acme/shared",
    label: "https://github.com/acme/shared",
    scopeText: "All my projects",
    templates: [
        {
            path: "/cache/acme-shared/0/element-templates/mail.json",
            reading: { kind: "read", templates: [{ id: "mail", name: "Mail" }] },
        },
    ],
};
const UNFETCHED: ListedMarketplace = {
    id: "local",
    entry: "/work/local",
    label: "/work/local",
    scopeText: "This project",
    problem: "No templates fetched yet. Update the marketplaces to fetch them.",
    templates: [],
};

describe("catalogModelOf for element templates", () => {
    it("lists each template of a file as enabled, with its version and engine, by name", () => {
        expect(
            rows(
                factsOf({
                    templates: [
                        templateFile(`${TEMPLATES}/mail.json`, {
                            kind: "read",
                            templates: [
                                { id: "mail", name: "Send Mail", version: 2, engine: "c8" },
                                { id: "crm", engine: "c7" },
                            ],
                        }),
                    ],
                }),
            ),
        ).toStrictEqual([
            {
                id: `template:config:/work/.camunda|${TEMPLATES}/mail.json#0:mail@2`,
                kind: "elementTemplate",
                kindText: "Element template",
                name: "Send Mail",
                detail: "Version 2",
                engineText: "Camunda 8",
                state: "enabled",
                stateText: "Enabled",
                actions: [],
            },
            {
                id: `template:config:/work/.camunda|${TEMPLATES}/mail.json#1:crm`,
                kind: "elementTemplate",
                kindText: "Element template",
                name: "crm",
                engineText: "Camunda 7",
                state: "enabled",
                stateText: "Enabled",
                actions: [],
            },
        ]);
    });

    it("names a template without a name by its id, then by its file", () => {
        const names = rows(
            factsOf({
                templates: [
                    templateFile(`${TEMPLATES}/a.json`, {
                        kind: "read",
                        templates: [{ id: "only-id" }, {}],
                    }),
                ],
            }),
        ).map(({ id, name }) => [id, name]);

        expect(names).toEqual([
            [`template:config:/work/.camunda|${TEMPLATES}/a.json#1`, "a.json"],
            [`template:config:/work/.camunda|${TEMPLATES}/a.json#0:only-id`, "only-id"],
        ]);
    });

    it("lists a template file it cannot read once, by its name, with why", () => {
        expect(
            onlyRow(
                factsOf({
                    templates: [
                        templateFile(`${TEMPLATES}/broken.json`, {
                            kind: "unreadable",
                            reason: "Unexpected token n in JSON",
                        }),
                    ],
                }),
            ),
        ).toStrictEqual({
            id: `template:config:/work/.camunda|${TEMPLATES}/broken.json`,
            kind: "elementTemplate",
            kindText: "Element template",
            name: "broken.json",
            state: "enabled",
            stateText: "Enabled",
            problem: "Cannot be read: Unexpected token n in JSON.",
            actions: [],
        });
    });

    it("lists a blank template file as no template", () => {
        expect(
            rows(
                factsOf({
                    templates: [
                        templateFile(`${TEMPLATES}/new.json`, { kind: "read", templates: [] }),
                    ],
                }),
            ),
        ).toEqual([]);
    });

    it("puts a config folder's plugins and templates in one source, plugins first", () => {
        const { model } = build(
            factsOf({
                plugins: [plugin(RESIZE, "Resize")],
                templates: [
                    templateFile(`${TEMPLATES}/a.json`, {
                        kind: "read",
                        templates: [{ id: "a", name: "Approve" }],
                    }),
                ],
            }),
        );

        expect(
            model.groups[0].sources.map(({ id, addOns }) => [id, addOns.map(({ name }) => name)]),
        ).toEqual([["config:/work/.camunda", ["Resize", "Approve"]]]);
    });

    it("lists a nested config folder's templates below the folder it applies to, and none outside every folder", () => {
        const { model } = build(
            factsOf({
                templates: [
                    templateFile(`${NESTED_TEMPLATES}/order.json`, {
                        kind: "read",
                        templates: [{ id: "order" }],
                    }),
                    templateFile("/elsewhere/.camunda/element-templates/x.json", {
                        kind: "read",
                        templates: [{ id: "x" }],
                    }),
                ],
            }),
        );

        expect(
            model.groups.map(({ id, sources }) =>
                sources.map(({ id: sourceId, description, addOns }) => ({
                    group: id,
                    sourceId,
                    description,
                    addOns: addOns.map(({ name }) => name),
                })),
            ),
        ).toEqual([
            [
                {
                    group: "folder:/work",
                    sourceId: "config:/work/orders/.camunda",
                    description: "Applies to diagrams below orders/",
                    addOns: ["order"],
                },
            ],
        ]);
    });

    it("records no template as shown, as no template offers an action yet", () => {
        const { shown } = build(
            factsOf({
                templates: [
                    templateFile(`${TEMPLATES}/a.json`, { kind: "read", templates: [{ id: "a" }] }),
                ],
            }),
        );

        expect(shown.size).toBe(0);
    });
});

describe("catalogModelOf for marketplaces", () => {
    it("lists each marketplace after the folders, with where it is registered, why it has no templates, and its removal", () => {
        const { model } = build(
            factsOf({
                plugins: [plugin(RESIZE, "Resize")],
                marketplaces: [SHARED, UNFETCHED],
            }),
        );

        expect(model.groups.map(({ id }) => id)).toEqual(["folder:/work", "marketplaces"]);
        expect(model.groups[1]).toStrictEqual({
            id: "marketplaces",
            kind: "marketplaces",
            label: "Marketplaces",
            description: "Element templates fetched from the registered marketplaces",
            sources: [
                {
                    id: "marketplace:acme-shared",
                    kind: "marketplace",
                    label: "https://github.com/acme/shared",
                    description: "All my projects",
                    actions: [{ kind: "removeMarketplace", label: "Remove" }],
                    addOns: [
                        {
                            id: "template:marketplace:acme-shared|/cache/acme-shared/0/element-templates/mail.json#0:mail",
                            kind: "elementTemplate",
                            kindText: "Element template",
                            name: "Mail",
                            state: "enabled",
                            stateText: "Enabled",
                            actions: [],
                        },
                    ],
                },
                {
                    id: "marketplace:local",
                    kind: "marketplace",
                    label: "/work/local",
                    description: "This project",
                    problem: "No templates fetched yet. Update the marketplaces to fetch them.",
                    actions: [{ kind: "removeMarketplace", label: "Remove" }],
                    addOns: [],
                },
            ],
        });
    });

    it("sorts a marketplace's templates by name, as a folder's", () => {
        const { model } = build(
            factsOf({
                marketplaces: [
                    {
                        ...SHARED,
                        templates: [
                            {
                                path: "/cache/acme-shared/0/element-templates/z.json",
                                reading: { kind: "read", templates: [{ id: "z", name: "Zebra" }] },
                            },
                            {
                                path: "/cache/acme-shared/0/element-templates/a.json",
                                reading: { kind: "read", templates: [{ id: "a", name: "Apple" }] },
                            },
                        ],
                    },
                ],
            }),
        );

        expect(model.groups[0].sources[0].addOns.map(({ name }) => name)).toEqual([
            "Apple",
            "Zebra",
        ]);
    });

    it("offers no action on a folder's sources", () => {
        const { model } = build(
            factsOf({
                plugins: [plugin(RESIZE, "Resize")],
                rulePackages: [rulePackage(ACME, "bpmnlint-plugin-acme", "1.2.0")],
            }),
        );

        expect(model.groups[0].sources.map(({ actions }) => actions)).toEqual([[], []]);
    });

    it("keeps the entry each marketplace source stands for, never sent", () => {
        const { sources } = build(factsOf({ marketplaces: [SHARED] }));

        expect([...sources]).toEqual([
            [
                "marketplace:acme-shared",
                {
                    kind: "marketplace",
                    label: "https://github.com/acme/shared",
                    entry: "https://github.com/acme/shared",
                    actions: ["removeMarketplace"],
                },
            ],
        ]);
    });

    it("tells apart the templates of two marketplace sources that share one cache slot", () => {
        const { model } = build(
            factsOf({
                marketplaces: [
                    { ...SHARED, id: '"acme/shared"', entry: "acme/shared" },
                    { ...SHARED, id: '"https://github.com/acme/shared"' },
                ],
            }),
        );

        const ids = model.groups[0].sources.flatMap(({ addOns }) => addOns.map(({ id }) => id));
        expect(new Set(ids).size).toBe(2);
    });

    it.each<{ case: string; marketplaces: ListedMarketplace[] | undefined; actions: string[] }>([
        {
            case: "a host that lists marketplaces",
            marketplaces: [],
            actions: ["addMarketplace", "updateMarketplaces", "pruneCache"],
        },
        { case: "a host that lists none", marketplaces: undefined, actions: ["pruneCache"] },
    ])("offers and records the catalog actions of $case", ({ marketplaces, actions }) => {
        const { model, catalogActions } = build(factsOf({ marketplaces }));

        expect(catalogActions).toEqual(actions);
        expect(model.actions).toEqual(
            actions.map((kind) => ({
                kind,
                label: {
                    addMarketplace: "Add marketplace…",
                    updateMarketplaces: "Update marketplaces",
                    pruneCache: "Remove unused plugin copies",
                }[kind],
            })),
        );
    });

    it("says why it lists no marketplace when their registrations cannot be read", () => {
        const problem = "The registered marketplaces could not be read. The log says why.";

        const { model } = build({
            ...factsOf({ folders: [] }),
            marketplaces: { kind: "unreadable", problem },
        });

        expect(model.groups).toStrictEqual([
            {
                id: "marketplaces",
                kind: "marketplaces",
                label: "Marketplaces",
                description: "Element templates fetched from the registered marketplaces",
                problem,
                sources: [],
            },
        ]);
        expect(model.actions.map(({ kind }) => kind)).toEqual([
            "addMarketplace",
            "updateMarketplaces",
            "pruneCache",
        ]);
    });

    it("shows no marketplaces group while none is registered", () => {
        expect(build(factsOf({ marketplaces: [] })).model.groups).toEqual([]);
    });

    it.each([
        {
            case: "no folder is open",
            folders: [],
            emptyText:
                "Open a folder to see the plugins, rule packages and element templates it brings.",
        },
        {
            case: "no folder brings an add-on",
            folders: ["/work"],
            emptyText:
                "No BPMN plugins, bpmnlint rule packages or element templates in this workspace.",
        },
    ])("says so when $case and only a marketplace is listed", ({ folders, emptyText }) => {
        const { model } = build(factsOf({ folders, marketplaces: [UNFETCHED] }));

        expect([model.groups.map(({ id }) => id), model.emptyText]).toEqual([
            ["marketplaces"],
            emptyText,
        ]);
    });
});

describe("catalogModelOf for template switches", () => {
    const SHOP_KEY = "configFolder:work/.camunda";
    const ACME_SOURCE = {
        key: "marketplace:github:github.com/acme/shared",
        scope: "allProjects",
    } as const;
    const SWITCHED_SHARED: ListedMarketplace = { ...SHARED, templateSource: ACME_SOURCE };
    const MAIL_FILE = `${TEMPLATES}/mail.json`;
    const MAIL_ID = `template:config:/work/.camunda|${MAIL_FILE}#0:mail@2`;
    const mailFile = templateFile(MAIL_FILE, {
        kind: "read",
        templates: [{ id: "mail", name: "Send Mail", version: 2 }, { name: "No id" }],
    });

    function switched(
        project: readonly TemplateSwitch[],
        allProjects: readonly TemplateSwitch[] = [],
    ): TemplatePreferencesByScope {
        return { project: { disabled: project }, allProjects: { disabled: allProjects } };
    }

    const templateRows = (facts: AddOnFacts) =>
        rows(facts).map((row) => {
            if (row.kind !== "elementTemplate") throw new Error("expected a template row");
            const { name, state, stateText, actions } = row;
            return { name, state, stateText, actions, ...(row.note && { note: row.note }) };
        });

    it.each<{
        case: string;
        preferences: TemplatePreferencesByScope | undefined;
        mail: Record<string, unknown>;
    }>([
        {
            case: "a host that keeps no switches",
            preferences: undefined,
            mail: { state: "enabled", stateText: "Enabled", actions: [] },
        },
        {
            case: "no switch off",
            preferences: NO_TEMPLATE_PREFERENCES,
            mail: {
                state: "enabled",
                stateText: "Enabled",
                actions: [{ kind: "disable", label: "Disable" }],
            },
        },
        {
            case: "its own switch off",
            preferences: switched([{ source: SHOP_KEY, templateId: "mail" }]),
            mail: {
                state: "disabled",
                stateText: "Disabled",
                actions: [{ kind: "enable", label: "Enable" }],
            },
        },
        {
            case: "its source off, its own switch kept",
            preferences: switched([{ source: SHOP_KEY, templateId: "mail" }, { source: SHOP_KEY }]),
            mail: {
                state: "disabled",
                stateText: "Disabled",
                actions: [],
                note: "Its source is disabled.",
            },
        },
        {
            case: "its switch off in the other scope only",
            preferences: switched([], [{ source: SHOP_KEY, templateId: "mail" }]),
            mail: {
                state: "enabled",
                stateText: "Enabled",
                actions: [{ kind: "disable", label: "Disable" }],
            },
        },
    ])("shows a template's switch with $case", ({ preferences, mail }) => {
        const facts = factsOf({
            templates: [mailFile],
            ...(preferences && { templatePreferences: preferences }),
        });

        expect(templateRows(facts)).toEqual([
            { name: "No id", state: "enabled", stateText: "Enabled", actions: [] },
            { name: "Send Mail", ...mail },
        ]);
    });

    it("shows every version and file of one id in one source alike", () => {
        const facts = factsOf({
            templates: [
                mailFile,
                templateFile(`${TEMPLATES}/old-mail.json`, {
                    kind: "read",
                    templates: [{ id: "mail", name: "Send Mail (old)", version: 1 }],
                }),
            ],
            templatePreferences: switched([{ source: SHOP_KEY, templateId: "mail" }]),
        });

        expect(
            templateRows(facts)
                .filter(({ name }) => name.startsWith("Send Mail"))
                .map(({ state }) => state),
        ).toEqual(["disabled", "disabled"]);
    });

    it("offers no switch for a template file it cannot read", () => {
        const facts = factsOf({
            templates: [
                templateFile(`${TEMPLATES}/broken.json`, { kind: "unreadable", reason: "bad" }),
            ],
            templatePreferences: NO_TEMPLATE_PREFERENCES,
        });

        expect(templateRows(facts)).toEqual([
            { name: "broken.json", state: "enabled", stateText: "Enabled", actions: [] },
        ]);
    });

    it.each<{
        case: string;
        preferences: TemplatePreferencesByScope;
        source: Record<string, unknown>;
    }>([
        {
            case: "templates on",
            preferences: NO_TEMPLATE_PREFERENCES,
            source: { actions: [{ kind: "disableTemplates", label: "Disable templates" }] },
        },
        {
            case: "templates off",
            preferences: switched([{ source: SHOP_KEY }]),
            source: {
                actions: [{ kind: "enableTemplates", label: "Enable templates" }],
                stateText: "Templates disabled",
            },
        },
    ])("offers a config folder's templates switch with $case", ({ preferences, source }) => {
        const { model } = build(
            factsOf({
                plugins: [plugin(RESIZE, "Resize")],
                templates: [mailFile],
                templatePreferences: preferences,
            }),
        );
        const [{ actions, stateText }] = model.groups[0].sources;

        expect({ actions, ...(stateText && { stateText }) }).toEqual(source);
    });

    it.each<{ case: string; facts: AddOnFacts }>([
        {
            case: "only plugins",
            facts: factsOf({
                plugins: [plugin(RESIZE, "Resize")],
                templatePreferences: NO_TEMPLATE_PREFERENCES,
            }),
        },
        {
            case: "only templates without an id",
            facts: factsOf({
                templates: [
                    templateFile(`${TEMPLATES}/a.json`, {
                        kind: "read",
                        templates: [{ name: "A" }],
                    }),
                ],
                templatePreferences: NO_TEMPLATE_PREFERENCES,
            }),
        },
        { case: "a host that keeps no switches", facts: factsOf({ templates: [mailFile] }) },
    ])("offers no templates switch on a config folder with $case", ({ facts }) => {
        const { model, sources } = build(facts);

        expect(model.groups[0].sources[0].actions).toEqual([]);
        expect(sources.size).toBe(0);
    });

    it.each<{
        case: string;
        marketplace: ListedMarketplace;
        preferences: TemplatePreferencesByScope;
        actions: string[];
        stateText?: string;
        mail: string;
    }>([
        {
            case: "templates on",
            marketplace: SWITCHED_SHARED,
            preferences: NO_TEMPLATE_PREFERENCES,
            actions: ["removeMarketplace", "disableTemplates"],
            mail: "enabled",
        },
        {
            case: "templates off where its switches live",
            marketplace: SWITCHED_SHARED,
            preferences: switched([], [{ source: ACME_SOURCE.key }]),
            actions: ["removeMarketplace", "enableTemplates"],
            stateText: "Templates disabled",
            mail: "disabled",
        },
        {
            case: "templates off in the other scope only",
            marketplace: SWITCHED_SHARED,
            preferences: switched([{ source: ACME_SOURCE.key }]),
            actions: ["removeMarketplace", "disableTemplates"],
            mail: "enabled",
        },
        {
            case: "an entry with no switches",
            marketplace: SHARED,
            preferences: switched([], [{ source: ACME_SOURCE.key }]),
            actions: ["removeMarketplace"],
            mail: "enabled",
        },
    ])(
        "offers a marketplace's templates switch with $case",
        ({ marketplace, preferences, actions, stateText, mail }) => {
            const { model } = build(
                factsOf({ marketplaces: [marketplace], templatePreferences: preferences }),
            );
            const [source] = model.groups[0].sources;

            expect({
                actions: source.actions.map(({ kind }) => kind),
                stateText: source.stateText,
                mail: source.addOns[0].state,
            }).toEqual({ actions, stateText, mail });
        },
    );

    it("keeps what each template and source switch showed, never sent", () => {
        const { templates, sources } = build(
            factsOf({
                templates: [mailFile],
                marketplaces: [SWITCHED_SHARED],
                templatePreferences: switched([{ source: SHOP_KEY, templateId: "mail" }]),
            }),
        );

        expect([...templates]).toEqual([
            [
                MAIL_ID,
                {
                    name: "Send Mail",
                    switch: { source: SHOP_KEY, templateId: "mail" },
                    scope: "project",
                    actions: ["enable"],
                },
            ],
            [
                "template:marketplace:acme-shared|/cache/acme-shared/0/element-templates/mail.json#0:mail",
                {
                    name: "Mail",
                    switch: { source: ACME_SOURCE.key, templateId: "mail" },
                    scope: "allProjects",
                    actions: ["disable"],
                },
            ],
        ]);
        expect([...sources]).toEqual([
            [
                "config:/work/.camunda",
                {
                    kind: "configFolder",
                    label: ".camunda",
                    templateSource: { key: SHOP_KEY, scope: "project" },
                    actions: ["disableTemplates"],
                },
            ],
            [
                "marketplace:acme-shared",
                {
                    kind: "marketplace",
                    label: "https://github.com/acme/shared",
                    entry: "https://github.com/acme/shared",
                    templateSource: ACME_SOURCE,
                    actions: ["removeMarketplace", "disableTemplates"],
                },
            ],
        ]);
    });

    it("records no template switch on a host that keeps none", () => {
        const { templates } = build(
            factsOf({ templates: [mailFile], marketplaces: [SWITCHED_SHARED] }),
        );

        expect(templates.size).toBe(0);
    });
});

describe("failedCatalogOf", () => {
    it("says the add-ons could not be listed when nothing was read before", () => {
        expect(failedCatalogOf(undefined, 9)).toEqual({
            revision: 9,
            groups: [],
            actions: [],
            problem: "Could not list the add-ons. The log says why.",
        });
    });

    it("keeps what was read before, with its own revision, so an allow against it still holds", () => {
        const previous = build(
            factsOf({ plugins: [plugin(RESIZE, "Resize")] }),
            sessionOf(),
            4,
        ).model;

        expect(failedCatalogOf(previous, 9)).toEqual({
            ...previous,
            problem:
                "Could not list the add-ons again. The list shows what it read before; the log says why.",
        });
    });
});
