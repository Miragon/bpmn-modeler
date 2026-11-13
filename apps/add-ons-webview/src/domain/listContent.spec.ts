import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { CATALOG } from "../__fixtures__/catalogs";
import { CatalogFilter, NO_FILTER } from "./catalogFilter";
import { catalogPhaseOf, listContentOf } from "./listContent";
import { sectionsOf } from "./listSections";

const ADD = { kind: "addMarketplace", label: "Add marketplace…" } as const;
const UPDATE = { kind: "updateMarketplaces", label: "Update marketplaces" } as const;
const PRUNE = { kind: "pruneCache", label: "Remove unused plugin copies" } as const;
const ACTIONS = [ADD, UPDATE, PRUNE];

const MARKETPLACES = CATALOG.groups[1]!;
const full: AddOnCatalogPayload = { ...CATALOG, actions: ACTIONS };
const onlyMarketplaces: AddOnCatalogPayload = {
    ...full,
    groups: [MARKETPLACES],
    emptyText: "Open a folder to see the plugins, rule packages and element templates it brings.",
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
    it.each<{ case: string; model: AddOnCatalogPayload; filter: CatalogFilter; content: object }>([
        {
            case: "an empty catalog says the core's text and offers only Add marketplace…",
            model: empty,
            filter: NO_FILTER,
            content: { kind: "catalogEmpty", text: empty.emptyText, buttons: [ADD] },
        },
        {
            case: "a failed catalog offers nothing it does not hold",
            model: failed,
            filter: NO_FILTER,
            content: { kind: "catalogEmpty", buttons: [] },
        },
        {
            case: "a catalog lists its sections",
            model: full,
            filter: NO_FILTER,
            content: { kind: "sections", sections: sectionsOf(full.groups) },
        },
        {
            case: "a catalog without a folder says the core's text where Installed would be",
            model: onlyMarketplaces,
            filter: NO_FILTER,
            content: {
                kind: "sections",
                sections: sectionsOf(onlyMarketplaces.groups),
                installedText: onlyMarketplaces.emptyText,
            },
        },
        {
            case: "a search lists what matches",
            model: full,
            filter: { ...NO_FILTER, query: "mail" },
            content: {
                kind: "sections",
                sections: sectionsOf([{ ...MARKETPLACES }]),
            },
        },
        {
            case: "a search that matches nothing says so",
            model: full,
            filter: { ...NO_FILTER, query: "nothing like this" },
            content: { kind: "noMatch" },
        },
    ])("$case", ({ model, filter, content }) => {
        expect(listContentOf(model, filter)).toEqual(content);
    });
});
