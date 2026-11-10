import { describe, expect, it } from "vitest";

import { CATALOG } from "../../__fixtures__/catalogs";
import { mountedView } from "../../__fixtures__/mountedView";

const nameOf = (element: Element | null) =>
    element?.querySelector(".name")?.textContent ?? element?.textContent;

describe("the outline's keyboard", () => {
    it.each([
        {
            case: "↓ moves to the next head",
            start: "work",
            keys: ["ArrowDown"],
            focused: ".camunda",
        },
        {
            case: "↑ moves to the previous head",
            start: ".camunda",
            keys: ["ArrowUp"],
            focused: "work",
        },
        { case: "End moves to the last head", start: "work", keys: ["End"], focused: "/shared" },
        { case: "Home moves to the first head", start: "Palette", keys: ["Home"], focused: "work" },
        {
            case: "← moves from a row to its source",
            start: "Palette",
            keys: ["ArrowLeft"],
            focused: ".camunda",
        },
        {
            case: "→ enters an open header",
            start: ".camunda",
            keys: ["ArrowRight"],
            focused: "Palette",
        },
        {
            case: "→ opens a closed header and then enters it",
            start: "/shared",
            keys: ["ArrowRight", "ArrowRight"],
            focused: "Mail",
        },
        {
            case: "a letter jumps to the next head it starts",
            start: "work",
            keys: ["n"],
            focused: "node_modules",
        },
        {
            case: "Enter on a row moves to its first control",
            start: "Resize Tasks",
            keys: ["Enter"],
            focused: "Review Resize Tasks before you allow it",
        },
    ])("$case", ({ start, keys, focused }) => {
        const { head, press } = mountedView(CATALOG);
        head(start).focus();

        keys.forEach((key) => press(key));

        expect(nameOf(document.activeElement)).toBe(focused);
    });

    it("moves the single tab stop with focus", () => {
        const { root, head, press } = mountedView(CATALOG);
        head("work").focus();

        press("ArrowDown");

        expect([...root.querySelectorAll('[data-head][tabindex="0"]')].map(nameOf)).toEqual([
            ".camunda",
        ]);
    });

    it("gives only the active row's buttons a tab stop", () => {
        const { head, button, press } = mountedView(CATALOG);
        head("Palette").focus();
        const revoke = button("Revoke", head("Palette"));
        const before = revoke.tabIndex;

        press("ArrowDown");

        expect([before, button("Revoke", head("Palette")).tabIndex]).toEqual([0, -1]);
    });

    it("closes an open header with ←", () => {
        const { head, press } = mountedView(CATALOG);
        head(".camunda").focus();

        press("ArrowLeft");

        expect(head(".camunda").getAttribute("aria-expanded")).toBe("false");
    });

    it("returns from a row's control to the row with Escape", () => {
        const { head, button, press } = mountedView(CATALOG);
        head("Palette").focus();
        button("Revoke", head("Palette")).focus();

        press("Escape");

        expect(document.activeElement).toBe(head("Palette"));
    });

    it.each([
        { key: "ArrowRight", from: "Add marketplace…", to: "Remove unused plugin copies" },
        { key: "ArrowRight", from: "Remove unused plugin copies", to: "Add marketplace…" },
        { key: "ArrowLeft", from: "Add marketplace…", to: "Remove unused plugin copies" },
        { key: "End", from: "Add marketplace…", to: "Remove unused plugin copies" },
        { key: "Home", from: "Remove unused plugin copies", to: "Add marketplace…" },
    ])("moves along the toolbar with $key from $from", ({ key, from, to }) => {
        const { button, press } = mountedView(CATALOG);
        button(from).focus();

        press(key);

        expect(document.activeElement?.textContent).toBe(to);
    });

    it("dismisses a banner with Escape", () => {
        const { session, root, button, press } = mountedView(CATALOG);
        session.dispatch({ kind: "actionChosen", actionKind: "pruneCache" });
        session.dispatch({
            kind: "resultArrived",
            requestId: 1,
            result: { kind: "failed", message: "No." },
        });
        button("Dismiss", root.querySelector(".banner-alert")!).focus();

        press("Escape");

        expect(root.querySelector("[role=alert]")?.textContent).toBe("");
    });
});
