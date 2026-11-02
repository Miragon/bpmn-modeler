import { describe, expect, it } from "vitest";

import { initialNavigation, navigate, shownItem } from "./builderNavigation";

const START = initialNavigation(3);

describe("initialNavigation", () => {
    it.each([
        [0, "template"],
        [1, "properties"],
    ])("starts a template with %i properties on the %s tab", (count, tab) => {
        expect(initialNavigation(count).tab).toBe(tab);
    });
});

describe("navigate", () => {
    it("closes the problems when the user switches the tab", () => {
        const open = navigate(START, { kind: "toggleProblems" });

        expect(open.problemsOpen).toBe(true);
        expect(navigate(open, { kind: "tab", tab: "groups" })).toMatchObject({
            tab: "groups",
            problemsOpen: false,
        });
    });

    it("keeps the problems open while one of them is shown", () => {
        const open = navigate(START, { kind: "toggleProblems" });

        expect(
            navigate(open, {
                kind: "show",
                tab: "properties",
                index: 2,
                focus: "property-2-label",
            }),
        ).toMatchObject({ problemsOpen: true, property: 2, focus: "property-2-label" });
    });

    it("clears the search so that a shown problem's field is there", () => {
        const searching = navigate(START, { kind: "search", query: "mail" });

        expect(
            navigate(searching, { kind: "show", tab: "groups", index: 1, focus: "group-1-id" }),
        ).toMatchObject({ query: "", tab: "groups", group: 1 });
    });

    it("scrolls to the top of an item it opens without a field to focus", () => {
        expect(navigate(START, { kind: "open", tab: "properties", index: 2 })).toMatchObject({
            property: 2,
            scrollToTop: true,
            focus: undefined,
        });
    });

    it("waits for a new field, which exists once its edit comes back", () => {
        const opened = navigate(START, {
            kind: "open",
            tab: "properties",
            index: 3,
            focus: "property-3-label",
        });
        expect(opened).toMatchObject({ focus: "property-3-label", scrollToTop: false });

        expect(navigate(opened, { kind: "arrived", focused: false }).focus).toBe(
            "property-3-label",
        );
        expect(navigate(opened, { kind: "arrived", focused: true }).focus).toBeUndefined();
    });

    it("leaves the other tab's selection alone", () => {
        const onGroup = navigate(START, { kind: "open", tab: "groups", index: 2 });

        expect(onGroup).toMatchObject({ group: 2, property: 0 });
        expect(navigate(onGroup, { kind: "open", tab: "template" })).toMatchObject({
            tab: "template",
            group: 2,
        });
    });

    it("closes the problems on request", () => {
        const open = navigate(START, { kind: "toggleProblems" });

        expect(navigate(open, { kind: "closeProblems" }).problemsOpen).toBe(false);
        expect(navigate(open, { kind: "toggleProblems" }).problemsOpen).toBe(false);
    });

    it("keeps what was typed into the search", () => {
        expect(navigate(START, { kind: "search", query: " Mail" }).query).toBe(" Mail");
    });
});

describe("shownItem", () => {
    it.each([
        ["the selected one", 1, 3, [0, 1, 2], 1],
        ["the last one, when the selected one is gone", 5, 3, [0, 1, 2], 2],
        ["the first match, when the search hides the selected one", 0, 3, [1, 2], 1],
        ["nothing when nothing matches", 1, 3, [], undefined],
        ["nothing when there is nothing", 0, 0, [], undefined],
    ])("shows %s", (_, selected, count, matching, shown) => {
        expect(shownItem(selected, count, matching)).toBe(shown);
    });
});
