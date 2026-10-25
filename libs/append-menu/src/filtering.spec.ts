import { describe, expect, it } from "vitest";

import {
    extractCategories,
    filterTemplates,
    flattenPaletteItems,
    processPaletteGroups,
    resolveSelectedType,
} from "./filtering";
import { group, templateEntry } from "./__fixtures__/entries";
import type { BpmnElementGroup } from "./types";

describe("filterTemplates", () => {
    const entries = [
        templateEntry("http", "HTTP Worker", { appliesTo: ["bpmn:ServiceTask"], search: ["rest"] }),
        templateEntry("mail", "Send Mail", { appliesTo: ["bpmn:SendTask"] }),
        templateEntry("user", "Approval", {
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

    it("matches a keyword given as a single string", () => {
        const withStringKeyword = [
            templateEntry("soap", "SOAP Worker", { search: "legacy webservice" }),
        ];

        expect(filterTemplates(withStringKeyword, "legacy webservice", null)).toHaveLength(1);
    });

    it("filters by active category", () => {
        expect(filterTemplates(entries, "", "human").map((e) => e.template?.id)).toEqual(["user"]);
    });
});

describe("extractCategories", () => {
    it("returns unique categories from the unfiltered list", () => {
        const entries = [
            templateEntry("a", "A", { category: { id: "c1", name: "One" } }),
            templateEntry("b", "B", { category: { id: "c2", name: "Two" } }),
            templateEntry("c", "C", { category: { id: "c1", name: "One" } }),
            templateEntry("d", "D"),
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
            ["create-service-task", "Service Task"],
            ["create-user-task", "User Task"],
        ]),
        group("gateways", "Gateways", [["create-exclusive-gateway", "Exclusive Gateway"]]),
    ];

    it("marks nothing disabled or hidden without a filter or search", () => {
        const p = processPaletteGroups(groups, [], "", null);
        const flags = p.groups.flatMap((g) => g.entries.map((e) => [e.disabled, e.hidden]));
        expect(flags.every(([d, h]) => !d && !h)).toBe(true);
    });

    it("hides entries that fail the appliesTo filter", () => {
        const p = processPaletteGroups(groups, [], "", new Set(["bpmn:ServiceTask"]));
        const service = p.groups[0].entries.find((e) => e.entry.label === "Service Task")!;
        const user = p.groups[0].entries.find((e) => e.entry.label === "User Task")!;
        expect(service.hidden).toBe(false);
        expect(user.hidden).toBe(true);
        expect(user.disabled).toBe(false);
    });

    it("hides entries that fail the search but leaves them enabled", () => {
        const p = processPaletteGroups(groups, [], "gateway", null);
        const gateway = p.groups[1].entries[0];
        const service = p.groups[0].entries[0];
        expect(gateway.hidden).toBe(false);
        expect(service.hidden).toBe(true);
        expect(service.disabled).toBe(false);
    });

    it("matches entries by their description", () => {
        const described = [
            group("tasks", "Tasks", [
                ["create-user-task", "User Task", { description: "Work done by a person" }],
                ["create-service-task", "Service Task"],
            ]),
        ];

        const p = processPaletteGroups(described, [], "person", null);
        expect(p.groups[0].entries.map((e) => e.hidden)).toEqual([false, true]);
    });

    it("resolves favourites in the given order", () => {
        const p = processPaletteGroups(groups, ["bpmn:UserTask", "bpmn:ServiceTask"], "", null);
        expect(p.favouriteEntries.map((e) => e.entry.label)).toEqual(["User Task", "Service Task"]);
    });
});

describe("flattenPaletteItems", () => {
    const groups = [group("tasks", "Tasks", [["create-service-task", "Service Task"]])];

    it("namespaces favourite and group instances of the same entry distinctly", () => {
        const processed = processPaletteGroups(groups, ["bpmn:ServiceTask"], "", null);
        const items = flattenPaletteItems(processed);
        expect(items.map((i) => i.key)).toEqual([
            "fav:create-service-task",
            "grp:tasks:create-service-task",
        ]);
    });

    it("carries the hidden flag through to the flattened items", () => {
        const processed = processPaletteGroups(groups, [], "gateway", new Set(["bpmn:UserTask"]));
        const item = flattenPaletteItems(processed).find((i) => i.key.startsWith("grp:"))!;
        expect(item.hidden).toBe(true); // fails both the appliesTo filter and the search
        expect(item.disabled).toBe(false);
    });

    it("exposes the raw entry id alongside the namespaced key", () => {
        const processed = processPaletteGroups(groups, ["bpmn:ServiceTask"], "", null);
        const items = flattenPaletteItems(processed);
        expect(items.map((i) => i.id)).toEqual(["create-service-task", "create-service-task"]);
    });
});

describe("resolveSelectedType", () => {
    const appliesTo = ["bpmn:ServiceTask", "bpmn:SendTask"];

    it("resolves the type the entry creates", () => {
        expect(resolveSelectedType("append-send-task", appliesTo)).toBe("bpmn:SendTask");
        expect(resolveSelectedType("create-service-task", appliesTo)).toBe("bpmn:ServiceTask");
    });

    it("does not let bpmn:Task shadow the subtype an entry creates", () => {
        expect(resolveSelectedType("append-user-task", ["bpmn:Task", "bpmn:UserTask"])).toBe(
            "bpmn:UserTask",
        );
    });

    it.each([
        ["a type outside appliesTo", "append-user-task"],
        ["an unknown entry", "append-gateway"],
        ["a variant of an appliesTo type", "append-message-intermediate-throw"],
        ["a template entry", "append.template-mail"],
    ])("returns undefined for %s", (_case, entryId) => {
        expect(
            resolveSelectedType(entryId, [...appliesTo, "bpmn:IntermediateThrowEvent"]),
        ).toBeUndefined();
    });
});

// Ids as bpmn-js-create-append-anything builds them (`append-<actionName>`). Upstream
// translates the labels, so a German UI hands the palette the German ones.
describe("with upstream create-append-anything entries", () => {
    const germanTasks = group("tasks", "Aufgaben", [
        ["append-task", "Aufgabe"],
        ["append-user-task", "Benutzer-Aufgabe"],
        ["append-service-task", "Serviceaufgabe"],
        ["append-send-task", "Sendeaufgabe"],
        ["append-rule-task", "Regel Aufgabe"],
    ]);
    const germanEvents = group("events", "Ereignisse", [
        ["append-none-intermediate-throwing", "Zwischenereignis (auslösend)"],
        ["append-message-intermediate-throw", "Nachrichten-Zwischenereignis (auslösend)"],
    ]);
    const subProcesses = group("subprocess", "Sub-processes", [
        ["append-event-subprocess", "Event sub-process"],
        ["append-collapsed-subprocess", "Sub-process (collapsed)"],
        ["append-expanded-subprocess", "Sub-process (expanded)"],
    ]);

    const favouriteIds = (groups: BpmnElementGroup[], favourites: string[]) =>
        processPaletteGroups(groups, favourites, "", null).favouriteEntries.map((e) => e.id);
    const visibleIds = (groups: BpmnElementGroup[], appliesTo: string[]) =>
        processPaletteGroups(groups, [], "", new Set(appliesTo))
            .groups.flatMap((g) => g.entries)
            .filter((e) => !e.hidden)
            .map((e) => e.id);

    it("resolves favourites independently of the translated labels", () => {
        expect(
            favouriteIds(
                [germanTasks, germanEvents],
                ["bpmn:BusinessRuleTask", "bpmn:IntermediateThrowEvent", "bpmn:UserTask"],
            ),
        ).toEqual(["append-rule-task", "append-none-intermediate-throwing", "append-user-task"]);
    });

    it("resolves a bpmn:SubProcess favourite to the plain sub-process", () => {
        expect(favouriteIds([subProcesses], ["bpmn:SubProcess"])).toEqual([
            "append-expanded-subprocess",
        ]);
    });

    it("drops favourites without an entry in the menu", () => {
        expect(favouriteIds([germanTasks], ["bpmn:StartEvent", "bpmn:Task"])).toEqual([
            "append-task",
        ]);
    });

    it("offers only the entries that create an appliesTo type", () => {
        expect(visibleIds([germanTasks], ["bpmn:Task", "bpmn:UserTask"])).toEqual([
            "append-task",
            "append-user-task",
        ]);
    });

    it("hides the variants of an appliesTo type, which would create a different element", () => {
        expect(
            visibleIds(
                [germanEvents, subProcesses],
                ["bpmn:IntermediateThrowEvent", "bpmn:SubProcess"],
            ),
        ).toEqual(["append-none-intermediate-throwing", "append-expanded-subprocess"]);
    });
});

// Shaped like the C8 entries: the modeler annotates the upstream entries with
// translated descriptions and search keywords, as one string or a list.
describe("with C8-annotated create-append-anything entries", () => {
    const c8Groups = [
        group("tasks", "Tasks", [
            [
                "append-user-task",
                "User task",
                { description: "Work that needs to be done by a person", search: "form human" },
            ],
            ["append-service-task", "Service task", { search: ["job worker", "job worker"] }],
        ]),
        group("subprocess", "Sub-processes", [
            [
                "append-call-activity",
                "Call activity",
                {
                    description: "Calls another process as a reusable subprocess",
                    search: "child process",
                },
            ],
            ["append-transaction", "Transaction"],
        ]),
    ];

    const matchingIds = (search: string) =>
        processPaletteGroups(c8Groups, [], search, null)
            .groups.flatMap((g) => g.entries)
            .filter((e) => !e.hidden)
            .map((e) => e.id);

    it("finds the call activity by its child process keyword", () => {
        expect(matchingIds("child process")).toEqual(["append-call-activity"]);
    });

    it.each([
        ["a keyword string", "human", ["append-user-task"]],
        ["a keyword list", "job", ["append-service-task"]],
        ["keywords regardless of case", "Child Process", ["append-call-activity"]],
        ["the label as before", "transaction", ["append-transaction"]],
        ["the description as before", "reusable", ["append-call-activity"]],
    ])("matches %s", (_case, search, expected) => {
        expect(matchingIds(search)).toEqual(expected);
    });
});
