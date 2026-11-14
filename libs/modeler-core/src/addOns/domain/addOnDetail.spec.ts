import { describe, expect, it } from "vitest";

import type { AddOnCatalogModel, CodeAddOnView } from "./addOnCatalogModel";
import { detailTargetOf } from "./addOnDetail";

const RESIZE = {
    id: "plugin:/work/.camunda/plugins/resize",
    name: "Resize Tasks",
} as CodeAddOnView;

const MODEL: AddOnCatalogModel = {
    revision: 1,
    groups: [
        {
            id: "folder:/work",
            kind: "folder",
            label: "work",
            description: "/work",
            sources: [
                {
                    id: "config:/work/.camunda",
                    kind: "configFolder",
                    label: ".camunda",
                    description: "",
                    actions: [],
                    addOns: [RESIZE],
                },
            ],
        },
        {
            id: "marketplaces",
            kind: "marketplaces",
            label: "Marketplaces",
            description: "",
            sources: [
                {
                    id: "marketplace:acme",
                    kind: "marketplace",
                    label: "github.com/acme/templates",
                    description: "",
                    actions: [],
                    addOns: [],
                },
            ],
        },
    ],
    actions: [],
};

describe("detailTargetOf", () => {
    it.each([
        {
            case: "an add-on the catalog lists, titled by its name",
            addOnId: RESIZE.id,
            target: { addOnId: RESIZE.id, title: "Add-on: Resize Tasks" },
        },
        {
            case: "a marketplace the catalog lists, titled by its label",
            addOnId: "marketplace:acme",
            target: { addOnId: "marketplace:acme", title: "Add-on: github.com/acme/templates" },
        },
        { case: "nothing for an id it does not list", addOnId: "plugin:/gone", target: undefined },
        { case: "nothing for a folder source", addOnId: "config:/work/.camunda", target: undefined },
    ])("is $case", ({ addOnId, target }) => {
        expect(detailTargetOf(MODEL, addOnId)).toEqual(target);
    });

    it("is nothing before a model", () => {
        expect(detailTargetOf(undefined, RESIZE.id)).toBeUndefined();
    });
});
