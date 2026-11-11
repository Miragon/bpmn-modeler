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
    isOnlyNeedsReview,
    needsReview,
    NEEDS_REVIEW_ONLY,
    NO_FILTER,
    withKindToggled,
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
        ["a kind", { kinds: new Set(["plugin"]) }, ["Palette", "Resize Tasks"]],
        [
            "several kinds",
            { kinds: new Set(["rulePackage", "elementTemplate"]) },
            ["Mail Task", "bpmnlint-plugin-acme"],
        ],
        ["what needs review", { onlyNeedsReview: true }, ["Resize Tasks", "bpmnlint-plugin-acme"]],
        [
            "all of them at once",
            { query: "resize", kinds: new Set(["plugin"]), onlyNeedsReview: true },
            ["Resize Tasks"],
        ],
    ])("keeps the add-ons that match %s", (_, change, expected) => {
        expect(namesOf(filteredGroups(model, filter(change)))).toEqual(expected);
    });

    it("drops the sources and groups a filter leaves empty", () => {
        const shown = filteredGroups(model, filter({ kinds: new Set(["rulePackage"]) }));

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
        ["a kind", { kinds: new Set(["plugin"]) }, true],
        ["only what needs review", { onlyNeedsReview: true }, true],
    ])("is %s: %s", (_, change, expected) => {
        expect(isFilterActive(filter(change))).toBe(expected);
    });
});

describe("isOnlyNeedsReview", () => {
    it.each<[string, Partial<CatalogFilter>, boolean]>([
        ["not without a filter", {}, false],
        ["only the review chip", { onlyNeedsReview: true }, true],
        ["not the review chip with a query", { onlyNeedsReview: true, query: "x" }, false],
        [
            "not the review chip with a kind",
            { onlyNeedsReview: true, kinds: new Set(["plugin"]) },
            false,
        ],
        ["the review chip with a blank query", { onlyNeedsReview: true, query: "  " }, true],
    ])("is %s", (_, change, expected) => {
        expect(isOnlyNeedsReview(filter(change))).toBe(expected);
    });

    it("is what the review preset filters by", () => {
        expect(NEEDS_REVIEW_ONLY).toEqual({ ...NO_FILTER, onlyNeedsReview: true });
    });
});

describe("withKindToggled", () => {
    it.each<[string, AddOnPayload["kind"][], AddOnPayload["kind"], AddOnPayload["kind"][]]>([
        ["adds a kind", [], "plugin", ["plugin"]],
        ["adds a second kind", ["plugin"], "rulePackage", ["plugin", "rulePackage"]],
        ["removes a chosen kind", ["plugin", "rulePackage"], "plugin", ["rulePackage"]],
    ])("%s", (_, before, kind, after) => {
        const toggled = withKindToggled(filter({ kinds: new Set(before), query: "x" }), kind);

        expect([[...toggled.kinds], toggled.query]).toEqual([after, "x"]);
    });
});

describe("catalogCounts", () => {
    it("counts the add-ons by kind and those that need review", () => {
        expect(catalogCounts(model)).toEqual({
            total: 4,
            byKind: { plugin: 2, rulePackage: 1, elementTemplate: 1 },
            needsReview: 2,
        });
    });
});
