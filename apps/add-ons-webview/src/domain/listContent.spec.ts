import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { CATALOG } from "../__fixtures__/catalogs";
import { NO_FILTER } from "./catalogFilter";
import { CatalogScope } from "./catalogScope";
import { catalogPhaseOf, listContentOf, openingScopeOf } from "./listContent";

const ADD = { kind: "addMarketplace", label: "Add marketplace…" } as const;
const UPDATE = { kind: "updateMarketplaces", label: "Update marketplaces" } as const;
const PRUNE = { kind: "pruneCache", label: "Remove unused plugin copies" } as const;
const ACTIONS = [ADD, UPDATE, PRUNE];

const FOLDER = CATALOG.groups[0]!;
const MARKETPLACES = CATALOG.groups[1]!;
const full: AddOnCatalogPayload = { ...CATALOG, actions: ACTIONS };
const onlyFolders: AddOnCatalogPayload = { ...full, groups: [FOLDER] };
const onlyMarketplaces: AddOnCatalogPayload = {
    ...full,
    groups: [MARKETPLACES],
    emptyText: "Open a folder to see the plugins, rule packages and element templates it brings.",
};
const unreadableMarketplaces: AddOnCatalogPayload = {
    ...onlyFolders,
    groups: [FOLDER, { ...MARKETPLACES, problem: "Could not read the marketplaces.", sources: [] }],
};
const empty: AddOnCatalogPayload = {
    revision: 1,
    groups: [],
    actions: ACTIONS,
    emptyText: "No BPMN plugins, bpmnlint rule packages or element templates in this workspace.",
};
const failed: AddOnCatalogPayload = {
    revision: 1,
    groups: [],
    actions: [],
    problem: "Could not list the add-ons. The log says why.",
};

describe("catalogPhaseOf", () => {
    it.each([
        ["loading before a model", undefined, "loading"],
        ["ready with groups", full, "ready"],
        ["empty without groups", empty, "empty"],
        ["failed without groups and with a problem", failed, "failed"],
    ] as const)("is %s", (_, model, phase) => {
        expect(catalogPhaseOf(model)).toBe(phase);
    });
});

describe("listContentOf", () => {
    it.each<{ case: string; model: AddOnCatalogPayload; scope: CatalogScope; content: object }>([
        {
            case: "an empty catalog says the core's text with every catalog action",
            model: empty,
            scope: "workspace",
            content: { kind: "catalogEmpty", text: empty.emptyText, buttons: ACTIONS },
        },
        {
            case: "a failed catalog offers what the core offers",
            model: failed,
            scope: "marketplaces",
            content: { kind: "catalogEmpty", text: undefined, buttons: [] },
        },
        {
            case: "a workspace without folders says the core's text, as no folder is open",
            model: onlyMarketplaces,
            scope: "workspace",
            content: { kind: "workspaceEmpty", text: onlyMarketplaces.emptyText },
        },
        {
            case: "a workspace without folders adds no word of its own to the core's",
            model: { ...onlyMarketplaces, emptyText: undefined },
            scope: "workspace",
            content: { kind: "workspaceEmpty", text: undefined },
        },
        {
            case: "no marketplace offers only Add marketplace…",
            model: onlyFolders,
            scope: "marketplaces",
            content: { kind: "noMarketplace", buttons: [ADD] },
        },
        {
            case: "unreadable marketplaces show their problem in their own tab",
            model: unreadableMarketplaces,
            scope: "marketplaces",
            content: {
                kind: "groups",
                groups: [unreadableMarketplaces.groups[1]],
                flat: true,
                buttons: [ADD, UPDATE],
            },
        },
        {
            case: "the workspace lists its folders without catalog buttons",
            model: full,
            scope: "workspace",
            content: { kind: "groups", groups: [FOLDER], flat: false, buttons: [] },
        },
        {
            case: "the marketplaces stand flat under Add and Update",
            model: full,
            scope: "marketplaces",
            content: { kind: "groups", groups: [MARKETPLACES], flat: true, buttons: [ADD, UPDATE] },
        },
    ])("$case", ({ model, scope, content }) => {
        expect(listContentOf(model, scope, NO_FILTER)).toEqual(content);
    });

    it.each<[CatalogScope, readonly unknown[]]>([
        ["workspace", []],
        ["marketplaces", [ADD, UPDATE]],
    ])("says no add-on matches a filter in the %s tab, with its buttons", (scope, buttons) => {
        expect(listContentOf(full, scope, { ...NO_FILTER, query: "nothing like this" })).toEqual({
            kind: "noMatch",
            buttons,
        });
    });
});

describe("openingScopeOf", () => {
    const withoutSources = { ...MARKETPLACES, sources: [] };
    const onlyAProblem = { ...withoutSources, problem: "Could not read the marketplaces." };

    it.each<{ case: string; model: AddOnCatalogPayload; scope: CatalogScope }>([
        { case: "the workspace beside a marketplace", model: full, scope: "workspace" },
        {
            case: "the marketplaces without a folder",
            model: onlyMarketplaces,
            scope: "marketplaces",
        },
        {
            case: "the marketplaces without a folder while they hold only a problem",
            model: { ...onlyMarketplaces, groups: [onlyAProblem] },
            scope: "marketplaces",
        },
        {
            case: "the workspace while neither tab lists anything",
            model: { ...onlyMarketplaces, groups: [withoutSources] },
            scope: "workspace",
        },
        { case: "the workspace with only a folder", model: onlyFolders, scope: "workspace" },
    ])("is $case", ({ model, scope }) => {
        expect(openingScopeOf(model)).toBe(scope);
    });
});
