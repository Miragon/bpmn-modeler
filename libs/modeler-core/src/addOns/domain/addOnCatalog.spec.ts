import { describe, expect, it } from "vitest";

import {
    CodeApproval,
    declineKeyOf,
    ListedPresence,
    PROCESS_RESTARTS,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
import { AddOnFacts, AddOnSession, AddOnView, catalogModelOf } from "./addOnCatalog";

const RESIZE = "/work/.camunda/plugins/resize";
const PALETTE = "/work/.camunda/plugins/palette";
const NESTED = "/work/orders/.camunda/plugins/order-tools";
const ACME = "/work/node_modules/bpmnlint-plugin-acme";
const RULES = "/work/node_modules/@acme/bpmnlint-plugin-rules";
const OTHER_RULES = "/other/node_modules/bpmnlint-plugin-other";

const found = (
    id: string,
    name: string,
    contentHash: string,
    version?: string,
): ListedPresence => ({
    kind: "found",
    name,
    artifact: {
        id,
        name,
        contentHash,
        files: [`${id}/client.js`],
        ...(version ? { version } : {}),
    },
});

function factsOf(overrides: Partial<AddOnFacts> = {}): AddOnFacts {
    return {
        folders: ["/work"],
        configFolder: ".camunda",
        approvals: [],
        plugins: [],
        rulePackages: [],
        ...overrides,
    };
}

function sessionOf(
    overrides: {
        plugin?: [string, SessionAnswer][];
        rulePackage?: [string, SessionAnswer][];
        revoked?: string[];
    } = {},
): AddOnSession {
    return {
        answers: {
            plugin: new Map(overrides.plugin ?? []),
            rulePackage: new Map(overrides.rulePackage ?? []),
        },
        revokedRulePackages: new Set(overrides.revoked ?? []),
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

describe("catalogModelOf", () => {
    it("groups add-ons by the innermost workspace folder, in the order the folders were opened", () => {
        const { model } = build(
            factsOf({
                folders: ["/work", "/other", "/work/orders"],
                plugins: [found(RESIZE, "Resize", "h1"), found(NESTED, "Order Tools", "h2")],
                rulePackages: [found(OTHER_RULES, "bpmnlint-plugin-other", "r1", "1.0.0")],
            }),
        );

        expect(
            model.groups.map(({ id, label, description, sources }) => ({
                id,
                label,
                description,
                addOns: sources.flatMap(({ addOns }) => addOns.map(({ name }) => name)),
            })),
        ).toEqual([
            { id: "folder:/work", label: "work", description: "/work", addOns: ["Resize"] },
            {
                id: "folder:/other",
                label: "other",
                description: "/other",
                addOns: ["bpmnlint-plugin-other"],
            },
            {
                id: "folder:/work/orders",
                label: "orders",
                description: "/work/orders",
                addOns: ["Order Tools"],
            },
        ]);
    });

    it("lists nothing outside every workspace folder", () => {
        const { model, shown } = build(
            factsOf({
                plugins: [found("/elsewhere/.camunda/plugins/x", "X", "h1")],
                rulePackages: [found("/elsewhere/node_modules/bpmnlint-plugin-x", "x", "r1")],
            }),
        );

        expect(model.groups).toEqual([]);
        expect(shown.size).toBe(0);
    });

    it("puts each add-on in its source: config folders first, the root's leading, then packages", () => {
        const { model } = build(
            factsOf({
                plugins: [found(NESTED, "Order Tools", "h2"), found(RESIZE, "Resize", "h1")],
                rulePackages: [found(ACME, "bpmnlint-plugin-acme", "r1", "1.2.0")],
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

    it("sorts the config folders below the root by path", () => {
        const { model } = build(
            factsOf({
                plugins: [
                    found("/work/b/.camunda/plugins/x", "X", "h1"),
                    found("/work/a/.camunda/plugins/y", "Y", "h2"),
                    found(RESIZE, "Resize", "h3"),
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
                    found(RESIZE, "Same", "h1"),
                    found(PALETTE, "Same", "h2"),
                    found("/work/.camunda/plugins/a", "Alpha", "h3"),
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
                    found("/work/.archive/.camunda/plugins/x", "X", "h1"),
                    found(RESIZE, "Resize", "h2"),
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
            found("/work/.camunda/plugins/a", "Alpha", "h1"),
            found("/work/.camunda/plugins/b", "Beta", "h2"),
            found("/work/.camunda/plugins/c", "Beta", "h3"),
            found("/work/.camunda/plugins/d", "Gamma", "h4"),
        ];

        const { model } = build(factsOf({ plugins: order.map((index) => listed[index]) }));

        expect(model.groups[0].sources[0].addOns.map(({ id }) => id)).toEqual(
            ["a", "b", "c", "d"].map((name) => `plugin:/work/.camunda/plugins/${name}`),
        );
    });

    it("names a filesystem root opened as a folder by its path", () => {
        const { model } = build(
            factsOf({ folders: ["/"], plugins: [found("/.camunda/plugins/x", "X", "h1")] }),
        );

        expect(model.groups.map(({ label }) => label)).toEqual(["/"]);
    });

    it("names a lint config's own package by its folder", () => {
        const { model } = build(factsOf({ rulePackages: [found("/work/rules", "rules", "r1")] }));

        expect(model.groups[0].sources[0]).toMatchObject({
            id: "packages:/work/rules",
            label: "rules",
        });
    });

    it.each<{
        case: string;
        presence: ListedPresence;
        approvals: CodeApproval[];
        state: string;
        stateText: string;
        actions: string[];
        problem?: string;
    }>([
        {
            case: "allowed content",
            presence: found(RESIZE, "Resize", "h1"),
            approvals: [{ pluginId: RESIZE, contentHash: "h1" }],
            state: "approved",
            stateText: "Allowed",
            actions: ["revoke:Revoke"],
        },
        {
            case: "content never allowed",
            presence: found(RESIZE, "Resize", "h1"),
            approvals: [],
            state: "new",
            stateText: "New",
            actions: ["allow:Allow this content"],
        },
        {
            case: "content changed since it was allowed",
            presence: found(RESIZE, "Resize", "h2"),
            approvals: [{ pluginId: RESIZE, contentHash: "h1" }],
            state: "changed",
            stateText: "Changed since you allowed it",
            actions: ["allow:Allow this content"],
        },
        {
            case: "content not hashed yet",
            presence: { kind: "unhashed", id: RESIZE, name: "resize" },
            approvals: [],
            state: "new",
            stateText: "New",
            actions: ["inspect:Review…"],
        },
        {
            case: "unreadable content once allowed",
            presence: { kind: "unreadable", id: RESIZE, name: "resize", reason: "it is broken" },
            approvals: [{ pluginId: RESIZE, contentHash: "h1" }],
            state: "changed",
            stateText: "Changed since you allowed it",
            actions: ["revoke:Revoke"],
            problem: "Cannot be allowed: it is broken.",
        },
        {
            case: "unreadable content never allowed",
            presence: { kind: "unreadable", id: RESIZE, name: "resize", reason: "it is broken" },
            approvals: [],
            state: "new",
            stateText: "New",
            actions: [],
            problem: "Cannot be allowed: it is broken.",
        },
        {
            case: "a folder gone since it was allowed",
            presence: { kind: "gone", id: RESIZE, name: "resize" },
            approvals: [{ pluginId: RESIZE, contentHash: "h1" }],
            state: "gone",
            stateText: "Folder gone",
            actions: ["revoke:Forget"],
        },
    ])(
        "offers for $case: $actions",
        ({ presence, approvals, state, stateText, actions, problem }) => {
            const row = onlyRow(factsOf({ plugins: [presence], approvals }));

            expect({
                state: row.state,
                stateText: row.stateText,
                actions: row.actions.map(({ kind, label }) => `${kind}:${label}`),
                problem: row.problem,
            }).toEqual({ state, stateText, actions, problem });
        },
    );

    it("reads a hash it was not given as new, and offers to read it", () => {
        const row = onlyRow(
            factsOf({
                rulePackages: [{ kind: "unhashed", id: ACME, name: "bpmnlint-plugin-acme" }],
                approvals: [{ pluginId: ACME, contentHash: "r1" }],
            }),
        );

        expect([row.state, row.actions.map(({ kind }) => kind)]).toEqual(["new", ["inspect"]]);
    });

    it("shows content declined this session as declined, and still offers to allow it", () => {
        const presence = found(RESIZE, "Resize", "h1");
        const row = onlyRow(
            factsOf({ plugins: [presence] }),
            sessionOf({
                plugin: [
                    [declineKeyOf({ id: RESIZE, name: "Resize", contentHash: "h1" }), "declined"],
                ],
            }),
        );

        expect([row.state, row.actions.map(({ kind }) => kind)]).toEqual(["declined", ["allow"]]);
    });

    it("keeps content left to the view new", () => {
        const row = onlyRow(
            factsOf({ plugins: [found(RESIZE, "Resize", "h1")] }),
            sessionOf({
                plugin: [
                    [
                        declineKeyOf({ id: RESIZE, name: "Resize", contentHash: "h1" }),
                        "leftForView",
                    ],
                ],
            }),
        );

        expect(row.state).toBe("new");
    });

    it("reads each kind's answers only for that kind", () => {
        const row = onlyRow(
            factsOf({ rulePackages: [found(ACME, "bpmnlint-plugin-acme", "r1")] }),
            sessionOf({
                plugin: [[declineKeyOf({ id: ACME, name: "x", contentHash: "r1" }), "declined"]],
            }),
        );

        expect(row.state).toBe("new");
    });

    it("shows what the user allows before they allow it", () => {
        const row = onlyRow(
            factsOf({ rulePackages: [found(ACME, "bpmnlint-plugin-acme", "r1", "1.2.0")] }),
        );

        expect(row).toMatchObject({
            id: `rulePackage:${ACME}`,
            kind: "rulePackage",
            kindText: "bpmnlint rule package",
            name: "bpmnlint-plugin-acme",
            detail: "1.2.0",
            review: {
                heading: "Review bpmnlint-plugin-acme before you allow it",
                warning:
                    "A rule package runs as a program with your user's rights, not only inside the editor. Allow it only if you trust it.",
                facts: [
                    { label: "Folder", value: "node_modules/bpmnlint-plugin-acme" },
                    { label: "Version", value: "1.2.0" },
                    { label: "Covers", value: "node_modules/bpmnlint-plugin-acme/client.js" },
                    { label: "Content hash", value: "r1" },
                ],
            },
        });
    });

    it("reviews a plugin without a version, naming every file it covers", () => {
        const plugin: ListedPresence = {
            kind: "found",
            name: "Palette",
            artifact: {
                id: PALETTE,
                name: "Palette",
                contentHash: "h2",
                files: [`${PALETTE}/client.js`, `${PALETTE}/palette.css`],
            },
        };

        expect(onlyRow(factsOf({ plugins: [plugin] })).review?.facts).toEqual([
            { label: "Folder", value: ".camunda/plugins/palette" },
            {
                label: "Covers",
                value: ".camunda/plugins/palette/client.js, .camunda/plugins/palette/palette.css",
            },
            { label: "Content hash", value: "h2" },
        ]);
    });

    it("shows a plugin's folder as its detail, and no review once it is allowed", () => {
        const row = onlyRow(
            factsOf({
                plugins: [found(RESIZE, "Resize", "h1")],
                approvals: [{ pluginId: RESIZE, contentHash: "h1" }],
            }),
        );

        expect(row).toMatchObject({ kindText: "BPMN plugin", detail: "plugins/resize" });
        expect(row.review).toBeUndefined();
    });

    it.each(PROCESS_RESTARTS)(
        "says a revoked rule package's code stays loaded until the user can %s",
        (restart) => {
            const { model } = catalogModelOf(
                factsOf({ rulePackages: [found(ACME, "bpmnlint-plugin-acme", "r1")] }),
                sessionOf({ revoked: [ACME] }),
                restart,
                1,
            );

            expect(model.groups[0].sources[0].addOns[0].note).toBe(
                {
                    reloadWindow: "Code it already ran stays loaded until you reload the window.",
                    restartIde: "Code it already ran stays loaded until you restart the IDE.",
                }[restart],
            );
        },
    );

    it("says nothing of loaded code once the rule package is allowed again, or for a plugin", () => {
        const facts = factsOf({
            plugins: [found(RESIZE, "Resize", "h1")],
            rulePackages: [found(ACME, "bpmnlint-plugin-acme", "r1")],
            approvals: [{ pluginId: ACME, contentHash: "r1" }],
        });

        expect(rows(facts, sessionOf({ revoked: [ACME, RESIZE] })).map(({ note }) => note)).toEqual(
            [undefined, undefined],
        );
    });

    it("keeps what it showed of each add-on, the content only where it was hashed, and what it offered", () => {
        const { shown } = build(
            factsOf({
                plugins: [found(RESIZE, "Resize", "h1")],
                rulePackages: [{ kind: "unhashed", id: ACME, name: "bpmnlint-plugin-acme" }],
            }),
        );

        expect([...shown]).toEqual([
            [
                `plugin:${RESIZE}`,
                {
                    kind: "plugin",
                    id: RESIZE,
                    name: "Resize",
                    content: { id: RESIZE, name: "Resize", contentHash: "h1" },
                    actions: ["allow"],
                },
            ],
            [
                `rulePackage:${ACME}`,
                {
                    kind: "rulePackage",
                    id: ACME,
                    name: "bpmnlint-plugin-acme",
                    actions: ["inspect"],
                },
            ],
        ]);
    });

    it("gives the same ids to the same add-ons in two builds", () => {
        const facts = factsOf({
            plugins: [found(RESIZE, "Resize", "h1")],
            rulePackages: [found(RULES, "@acme/bpmnlint-plugin-rules", "r2")],
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
            emptyText: "Open a folder to see the plugins and rule packages it brings.",
        },
        {
            case: "no folder brings an add-on",
            folders: ["/work"],
            emptyText: "No BPMN plugins or bpmnlint rule packages in this workspace.",
        },
    ])("says so when $case", ({ folders, emptyText }) => {
        expect(build(factsOf({ folders })).model.emptyText).toBe(emptyText);
    });

    it("says nothing is empty once one add-on is listed", () => {
        expect(
            build(factsOf({ plugins: [found(RESIZE, "Resize", "h1")] })).model.emptyText,
        ).toBeUndefined();
    });
});
