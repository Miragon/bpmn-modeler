import { describe, expect, it } from "vitest";

import { fakeElementTemplates } from "../__fixtures__/elementTemplates";
import { ElementTemplateOffer } from "./ElementTemplateOffer";
import { HiddenTemplatePopupFilter } from "./HiddenTemplatePopupFilter";

// The hidden template comes first, so a lookup without an id would find it.
const TEMPLATES = [{ id: "mail" }, { id: "rest" }];

function filterHiding(hiddenIds: string[]) {
    const registered: { menu: string; priority: number }[] = [];
    const popupMenu = {
        registerProvider: (menu: string, priority: number, _provider: unknown) =>
            registered.push({ menu, priority }),
    };
    const offer = new ElementTemplateOffer(fakeElementTemplates(TEMPLATES));
    offer.setHidden(hiddenIds.map((id) => ({ id })));
    return { filter: new HiddenTemplatePopupFilter(popupMenu, offer), registered };
}

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
            const { filter } = filterHiding(["mail"]);
            const entries = {
                [`${menu}.task`]: { label: "Task" },
                [`${menu}.template-mail`]: { label: "Mail", group: { id: "templates" } },
                [`${menu}.template-rest`]: { label: "REST", group: { id: "templates" } },
            };

            expect(Object.keys(filter.getPopupMenuEntries(null)(entries))).toEqual([
                `${menu}.task`,
                `${menu}.template-rest`,
            ]);
        },
    );

    it("keeps an entry in the templates group whose key names no template", () => {
        const { filter } = filterHiding(["mail"]);
        const entries = { "differently-keyed": { label: "Mail", group: { id: "templates" } } };

        expect(filter.getPopupMenuEntries(null)(entries)).toEqual(entries);
    });
});
