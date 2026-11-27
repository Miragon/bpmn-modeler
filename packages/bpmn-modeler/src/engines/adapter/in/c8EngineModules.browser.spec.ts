import { describe, expect, it } from "vitest";

import { C8_PROPERTIES_PANEL_DEFAULTS } from "./c8EngineModules";

type FeelPopupLinks = (type: string) => { title: string; href: string }[] | undefined;

const getFeelPopupLinks = C8_PROPERTIES_PANEL_DEFAULTS.getFeelPopupLinks as FeelPopupLinks;

describe("C8 FEEL popup links", () => {
    it.each([
        ["feel", "Learn FEEL expressions"],
        ["feelers", "Learn templating"],
    ])("link the %s editor to its Camunda docs", (type, title) => {
        expect(getFeelPopupLinks(type)).toEqual([
            { title, href: expect.stringMatching(/^https:\/\/docs\.camunda\.io\//) },
        ]);
    });

    it("link no other editor", () => {
        expect(getFeelPopupLinks("unrelated")).toBeUndefined();
    });
});
