import { describe, expect, it } from "vitest";

import { fakeElementTemplates } from "../__fixtures__/elementTemplates";
import { ElementTemplateOffer } from "./ElementTemplateOffer";
import { HiddenTemplatePopupFilter } from "./HiddenTemplatePopupFilter";

// The hidden template comes first, so a lookup without an id would find it.
const TEMPLATES = [{ id: "mail" }, { id: "rest" }];

type EntriesFilter = (entries: Record<string, object>) => Record<string, object>;

interface Provider {
    getPopupMenuEntries(target: unknown): EntriesFilter;
}

function filterHiding(hiddenIds: string[]) {
    const registered: { menu: string; priority: number }[] = [];
    const providers = new Map<string, Provider>();
    const popupMenu = {
        registerProvider: (menu: string, priority: number, provider: Provider) => {
            registered.push({ menu, priority });
            providers.set(menu, provider);
        },
    };
    const offer = new ElementTemplateOffer(fakeElementTemplates(TEMPLATES));
    offer.setHidden(hiddenIds.map((id) => ({ id })));
    new HiddenTemplatePopupFilter(popupMenu, offer);
    const filterOf = (menu: string, target: unknown = null) =>
        providers.get(menu)!.getPopupMenuEntries(target);
    return { filterOf, registered };
}

const USING_MAIL = { type: "bpmn:Task", appliedTemplate: TEMPLATES[0] };

describe("HiddenTemplatePopupFilter", () => {
    it("runs on the replace, append and create menus after their default-priority providers", () => {
        const { registered } = filterHiding([]);

        expect(registered).toEqual([
            { menu: "bpmn-replace", priority: 100 },
            { menu: "bpmn-append", priority: 100 },
            { menu: "bpmn-create", priority: 100 },
        ]);
    });

    it.each(["append", "create", "replace"])(
        "drops the %s entries of hidden templates and keeps every other entry",
        (menu) => {
            const { filterOf } = filterHiding(["mail"]);
            const entries = {
                [`${menu}.task`]: { label: "Task" },
                [`${menu}.template-mail`]: { label: "Mail", group: { id: "templates" } },
                [`${menu}.template-rest`]: { label: "REST", group: { id: "templates" } },
            };

            expect(Object.keys(filterOf(`bpmn-${menu}`)(entries))).toEqual([
                `${menu}.task`,
                `${menu}.template-rest`,
            ]);
        },
    );

    it("keeps an entry in the templates group whose key names no template", () => {
        const { filterOf } = filterHiding(["mail"]);
        const entries = { "differently-keyed": { label: "Mail", group: { id: "templates" } } };

        expect(filterOf("bpmn-replace")(entries)).toEqual(entries);
    });

    it("keeps the replace entry of a hidden template the target already uses, which changes its preset", () => {
        const { filterOf } = filterHiding(["mail"]);
        const entries = { "replace.template-mail": { label: "Mail" } };

        expect(filterOf("bpmn-replace", USING_MAIL)(entries)).toEqual(entries);
    });

    it.each(["append", "create"])(
        "drops the %s entry of a hidden template the target uses, which makes a new element",
        (menu) => {
            const { filterOf } = filterHiding(["mail"]);
            const entries = { [`${menu}.template-mail`]: { label: "Mail" } };

            expect(filterOf(`bpmn-${menu}`, USING_MAIL)(entries)).toEqual({});
        },
    );
});
