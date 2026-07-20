import { describe, expect, it } from "vitest";

import {
    extractCategories,
    filterTemplates,
    flattenPaletteItems,
    processPaletteGroups,
} from "./filtering";
import type { BpmnElementGroup, EnrichedTemplateEntry, PopupMenuEntry } from "./types";

const noop = (): void => {};

/** Builds an enriched template entry with a minimal template stub. */
function template(
    id: string,
    label: string,
    opts: {
        appliesTo?: string[];
        category?: { id: string; name: string };
        search?: string[];
        description?: string;
    } = {},
): EnrichedTemplateEntry {
    const entry: PopupMenuEntry = {
        label,
        description: opts.description,
        search: opts.search,
        action: noop,
    };
    return {
        id: `append.template-${id}`,
        entry,
        template: {
            id,
            appliesTo: opts.appliesTo ?? [],
            category: opts.category,
        } as never,
    };
}

/** Builds a BPMN element group. */
function group(id: string, name: string, entries: [string, string][]): BpmnElementGroup {
    return {
        id,
        name,
        entries: entries.map(([entryId, label]) => ({
            id: entryId,
            entry: { label, action: noop } as PopupMenuEntry,
        })),
    };
}

describe("filterTemplates", () => {
    const entries = [
        template("http", "HTTP Worker", { appliesTo: ["bpmn:ServiceTask"], search: ["rest"] }),
        template("mail", "Send Mail", { appliesTo: ["bpmn:SendTask"] }),
        template("user", "Approval", {
            appliesTo: ["bpmn:UserTask"],
            category: { id: "human", name: "Human" },
        }),
    ];

    it("returns all entries for an empty search and no category", () => {
        expect(filterTemplates(entries, "", null)).toHaveLength(3);
    });

    it("matches templates by their appliesTo type label", () => {
        // "service task" must surface the bpmn:ServiceTask template.
        const result = filterTemplates(entries, "service task", null);
        expect(result.map((e) => e.template?.id)).toEqual(["http"]);
    });

    it("matches by keyword search terms", () => {
        expect(filterTemplates(entries, "rest", null).map((e) => e.template?.id)).toEqual(["http"]);
    });

    it("filters by active category", () => {
        expect(filterTemplates(entries, "", "human").map((e) => e.template?.id)).toEqual(["user"]);
    });
});

describe("extractCategories", () => {
    it("returns unique categories from the unfiltered list", () => {
        const entries = [
            template("a", "A", { category: { id: "c1", name: "One" } }),
            template("b", "B", { category: { id: "c2", name: "Two" } }),
            template("c", "C", { category: { id: "c1", name: "One" } }),
            template("d", "D"),
        ];
        expect(extractCategories(entries)).toEqual([
            { id: "c1", name: "One" },
            { id: "c2", name: "Two" },
        ]);
    });
});

describe("processPaletteGroups", () => {
    const groups = [
        group("tasks", "Tasks", [
            ["create.service-task", "Service Task"],
            ["create.user-task", "User Task"],
        ]),
        group("gateways", "Gateways", [["create.exclusive-gateway", "Exclusive Gateway"]]),
    ];

    it("marks nothing disabled or hidden without a filter or search", () => {
        const p = processPaletteGroups(groups, [], "", null);
        const flags = p.groups.flatMap((g) => g.entries.map((e) => [e.disabled, e.hidden]));
        expect(flags.every(([d, h]) => !d && !h)).toBe(true);
    });

    it("disables entries that fail the appliesTo filter but keeps them visible", () => {
        const p = processPaletteGroups(groups, [], "", new Set(["bpmn:ServiceTask"]));
        const service = p.groups[0].entries.find((e) => e.entry.label === "Service Task")!;
        const user = p.groups[0].entries.find((e) => e.entry.label === "User Task")!;
        expect(service.disabled).toBe(false);
        expect(user.disabled).toBe(true);
        // disabled is not hidden — the button still renders greyed out.
        expect(user.hidden).toBe(false);
    });

    it("hides entries that fail the search but leaves them enabled", () => {
        const p = processPaletteGroups(groups, [], "gateway", null);
        const gateway = p.groups[1].entries[0];
        const service = p.groups[0].entries[0];
        expect(gateway.hidden).toBe(false);
        expect(service.hidden).toBe(true);
        expect(service.disabled).toBe(false);
    });

    it("resolves favourites in the given order", () => {
        const p = processPaletteGroups(groups, ["bpmn:UserTask", "bpmn:ServiceTask"], "", null);
        expect(p.favouriteEntries.map((e) => e.entry.label)).toEqual(["User Task", "Service Task"]);
    });
});

describe("flattenPaletteItems", () => {
    const groups = [group("tasks", "Tasks", [["create.service-task", "Service Task"]])];

    it("namespaces favourite and group instances of the same entry distinctly", () => {
        const processed = processPaletteGroups(groups, ["bpmn:ServiceTask"], "", null);
        const items = flattenPaletteItems(processed);
        expect(items.map((i) => i.key)).toEqual([
            "fav:create.service-task",
            "grp:tasks:create.service-task",
        ]);
    });

    it("carries disabled/hidden flags through to the flattened items", () => {
        const processed = processPaletteGroups(groups, [], "gateway", new Set(["bpmn:UserTask"]));
        const item = flattenPaletteItems(processed).find((i) => i.key.startsWith("grp:"))!;
        expect(item.disabled).toBe(true); // fails the appliesTo filter
        expect(item.hidden).toBe(true); // fails the search
    });
});
