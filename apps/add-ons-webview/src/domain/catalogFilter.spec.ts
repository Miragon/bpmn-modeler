import type {
    AddOnCatalogPayload,
    AddOnGroupPayload,
    AddOnPayload,
    AddOnSourcePayload,
} from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import {
    catalogCounts,
    CatalogFilter,
    filteredGroups,
    isFilterActive,
    needsReview,
    NO_FILTER,
} from "./catalogFilter";

const ALLOW = { kind: "allow", label: "Allow" } as const;
const REVOKE = { kind: "revoke", label: "Revoke" } as const;
const DISABLE = { kind: "disable", label: "Disable" } as const;

const palette: AddOnPayload = {
    id: "plugin:/work/palette",
    kind: "plugin",
    kindText: "BPMN plugin",
    name: "Palette",
    detail: "plugins/palette",
    state: "approved",
    stateText: "Allowed",
    actions: [REVOKE],
};
const resize: AddOnPayload = {
    id: "plugin:/work/resize",
    kind: "plugin",
    kindText: "BPMN plugin",
    name: "Resize Tasks",
    state: "new",
    stateText: "Not allowed yet",
    actions: [ALLOW],
};
const acme: AddOnPayload = {
    id: "rulePackage:/work/acme",
    kind: "rulePackage",
    kindText: "bpmnlint rule package",
    name: "bpmnlint-plugin-acme",
    state: "new",
    stateText: "Not allowed yet",
    actions: [ALLOW],
};
const mail: AddOnPayload = {
    id: "template:/work/mail",
    kind: "elementTemplate",
    kindText: "Element template",
    name: "Mail Task",
    engineText: "Camunda 8",
    state: "enabled",
    stateText: "Enabled",
    actions: [DISABLE],
};

function source(id: string, label: string, addOns: AddOnPayload[]): AddOnSourcePayload {
    return { id, kind: "configFolder", label, description: "", actions: [], addOns };
}

const brokenMarketplace: AddOnSourcePayload = {
    ...source("marketplace:broken", "https://example.com/broken", []),
    kind: "marketplace",
    problem: "Could not fetch the marketplace: 404 Not Found.",
};

const groups: AddOnGroupPayload[] = [
    {
        id: "folder:/work",
        kind: "folder",
        label: "work",
        description: "/work",
        sources: [
            source("config:/work/.camunda", ".camunda", [palette, resize, mail]),
            source("packages:/work/node_modules", "node_modules", [acme]),
        ],
    },
    {
        id: "marketplaces",
        kind: "marketplaces",
        label: "Marketplaces",
        description: "",
        sources: [brokenMarketplace],
    },
];

const model: AddOnCatalogPayload = { revision: 1, groups, actions: [] };

function filter(change: Partial<CatalogFilter>): CatalogFilter {
    return { ...NO_FILTER, ...change };
}

function namesOf(shown: readonly AddOnGroupPayload[]): string[] {
    return shown.flatMap((group) =>
        group.sources.flatMap((each) => each.addOns.map(({ name }) => name)),
    );
}

describe("needsReview", () => {
    it.each([
        ["an add-on that offers Allow", resize, true],
        ["a rule package that offers Allow", acme, true],
        ["an allowed add-on", palette, false],
        ["a template", mail, false],
    ])("is %s: %s", (_, addOn, expected) => {
        expect(needsReview(addOn)).toBe(expected);
    });
});

describe("filteredGroups", () => {
    it("shows the whole catalog, empty sources included, without a filter", () => {
        expect(filteredGroups(model, NO_FILTER)).toBe(groups);
    });

    it.each<[string, Partial<CatalogFilter>, string[]]>([
        ["a name", { query: "resize" }, ["Resize Tasks"]],
        ["any case", { query: "MAIL" }, ["Mail Task"]],
        ["every word of the query, in any field", { query: "camunda 8" }, ["Mail Task"]],
        ["the detail", { query: "plugins/palette" }, ["Palette"]],
        ["the kind text", { query: "bpmnlint" }, ["bpmnlint-plugin-acme"]],
        ["the state text", { query: "not allowed" }, ["Resize Tasks", "bpmnlint-plugin-acme"]],
        ["the source's label", { query: "node_modules" }, ["bpmnlint-plugin-acme"]],
        [
            "the group's label",
            { query: "work" },
            ["Palette", "Resize Tasks", "Mail Task", "bpmnlint-plugin-acme"],
        ],
        ["a kind", { kind: "plugin" }, ["Palette", "Resize Tasks"]],
        ["a query and a kind at once", { query: "resize", kind: "plugin" }, ["Resize Tasks"]],
    ])("keeps the add-ons that match %s", (_, change, expected) => {
        expect(namesOf(filteredGroups(model, filter(change)))).toEqual(expected);
    });

    it("drops the sources and groups a filter leaves empty", () => {
        const shown = filteredGroups(model, filter({ kind: "rulePackage" }));

        expect(shown.map(({ id }) => id)).toEqual(["folder:/work"]);
        expect(shown[0]?.sources.map(({ id }) => id)).toEqual(["packages:/work/node_modules"]);
    });

    it("ignores a query of only spaces", () => {
        expect(filteredGroups(model, filter({ query: "   " }))).toBe(groups);
    });
});

describe("isFilterActive", () => {
    it.each<[string, Partial<CatalogFilter>, boolean]>([
        ["no filter", {}, false],
        ["a blank query", { query: "  " }, false],
        ["a query", { query: "x" }, true],
        ["a kind", { kind: "plugin" }, true],
    ])("is %s: %s", (_, change, expected) => {
        expect(isFilterActive(filter(change))).toBe(expected);
    });
});

describe("catalogCounts", () => {
    it("counts what waits and what has a problem only of the chosen kind", () => {
        expect(catalogCounts(model, "rulePackage")).toMatchObject({
            total: 4,
            needsReview: 1,
            problems: 0,
        });
    });

    it("counts the add-ons by kind, those that need review and those with a problem", () => {
        const broken = { ...palette, id: "plugin:/work/broken", problem: "Cannot be read." };
        const withBroken: AddOnCatalogPayload = {
            ...model,
            groups: [{ ...groups[0]!, sources: [source("s", "s", [broken])] }, ...groups],
        };

        expect(catalogCounts(withBroken)).toEqual({
            total: 5,
            byKind: { plugin: 3, rulePackage: 1, elementTemplate: 1 },
            needsReview: 2,
            problems: 1,
        });
    });
});
