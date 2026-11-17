import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MergeMenuRowContent } from "../../domain/mergeMenuRows";
import { type MergeMenuActions, MergeMenu, type MergeMenuState } from "./mergeMenu";

const translate = (key: string, replacements: Record<string, string> = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? name);

const CONFLICT_ROW: MergeMenuRowContent = {
    id: "Message_1",
    type: "bpmn:Message",
    marker: "conflict",
    name: "Order received",
    decisions: [
        { kind: "keep", scope: "element", side: "current" },
        { kind: "keep", scope: "element", side: "incoming" },
    ],
};

const PICKED_ROW: MergeMenuRowContent = {
    id: "Error_1",
    type: "bpmn:Error",
    marker: "takenFromThisSide",
    decisions: [
        { kind: "keep", scope: "element", side: "current" },
        { kind: "undo", scope: "element" },
    ],
};

const STATE: MergeMenuState = {
    stepList: "openConflicts",
    canStep: true,
    rows: [CONFLICT_ROW, PICKED_ROW],
    built: false,
    notesCount: 0,
    notesOpen: false,
};

describe("MergeMenu", () => {
    let opener: HTMLButtonElement;
    let outside: HTMLButtonElement;
    let menu: MergeMenu;
    let actions: { [Key in keyof MergeMenuActions]: ReturnType<typeof vi.fn> };

    const button = (name: string): HTMLButtonElement => {
        const found = [...menu.element.querySelectorAll("button")].find(
            (candidate) =>
                candidate.getAttribute("aria-label") === name || candidate.textContent === name,
        );
        if (!found) throw new Error(`no button ${name}`);
        return found;
    };
    const rowOf = (id: string) => menu.element.querySelector<HTMLElement>(`[data-row-for="${id}"]`);
    const rowButtons = (id: string) =>
        [...(rowOf(id)?.querySelectorAll<HTMLButtonElement>(".merge-menu__mini") ?? [])].map(
            (rowButton) => rowButton.textContent,
        );
    const key = (name: string) =>
        document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", { key: name, bubbles: true }),
        );
    const shows = (element: Element | null) =>
        element !== null && element.closest("[hidden]") === null;

    beforeEach(() => {
        // jsdom lays nothing out, so it has no scrollIntoView.
        Element.prototype.scrollIntoView = () => undefined;
        opener = document.createElement("button");
        outside = document.createElement("button");
        actions = {
            onStepList: vi.fn(),
            onShowAll: vi.fn(),
            onShapeless: vi.fn(),
            onDecide: vi.fn(),
            onCompare: vi.fn(),
            onReviewNotes: vi.fn(),
            onBuild: vi.fn(),
        };
        menu = new MergeMenu(actions as unknown as MergeMenuActions, translate, opener);
        document.body.append(opener, outside, menu.element);
        menu.update(STATE);
    });

    afterEach(() => {
        menu.close(false);
        opener.remove();
        outside.remove();
        menu.element.remove();
    });

    describe("its entries", () => {
        it("offers the step list as radios, Show all, the rows, the comparisons and the notes", () => {
            menu.open(true);

            const radios = [...menu.element.querySelectorAll('[role="radio"]')];
            expect(
                radios.map((radio) => [radio.textContent, radio.getAttribute("aria-checked")]),
            ).toStrictEqual([
                ["Open conflicts", "true"],
                ["All merged elements", "false"],
            ]);
            expect(
                menu.element.querySelector('[role="radiogroup"]')?.getAttribute("aria-label"),
            ).toBe("Step through");
            expect(button("Show all").disabled).toBe(false);
            expect(menu.element.textContent).toContain("Not visible in the diagram (2)");
            expect(button("Compare with current").disabled).toBe(true);
            expect(button("Compare with incoming").disabled).toBe(true);
            expect(button("Review notes (0)").disabled).toBe(true);
        });

        it("switches the step list and goes back to the whole diagram", () => {
            menu.open(true);

            button("All merged elements").click();
            button("Show all").click();

            expect(actions.onStepList).toHaveBeenCalledWith("all");
            expect(actions.onShowAll).toHaveBeenCalledOnce();
            expect(menu.isOpen()).toBe(false);
        });

        it("compares once a result is built and opens the notes once there are some", () => {
            menu.update({ ...STATE, built: true, notesCount: 2 });
            menu.open(true);

            button("Compare with incoming").click();
            menu.open(true);
            button("Review notes (2)").click();

            expect(actions.onCompare).toHaveBeenCalledWith("incoming");
            expect(actions.onReviewNotes).toHaveBeenCalledOnce();
        });

        it("offers no Build while the bar has room for it", () => {
            menu.open(true);

            expect(shows(menu.element.querySelector(".merge-menu__build"))).toBe(false);
        });

        it("offers Build as its first item where a narrow bar moved it there, disabled with the conflicts left as its tooltip and its description", () => {
            menu.update({ ...STATE, build: { canBuild: false, openConflicts: 2 } });
            menu.open(true);

            const build = button("Build");
            expect(shows(build)).toBe(true);
            expect(menu.element.querySelector("button")).toBe(build);
            expect(build.disabled).toBe(true);
            const reason = document.getElementById(build.getAttribute("aria-describedby")!);
            expect(reason?.textContent).toBe("2 conflicts left");
            expect(build.parentElement?.getAttribute("data-merge-tooltip")).toBe(
                "2 conflicts left",
            );
            build.click();
            expect(actions.onBuild).not.toHaveBeenCalled();
        });

        it("builds from its Build once no conflict is open, and closes", () => {
            menu.update({ ...STATE, build: { canBuild: true, openConflicts: 0 } });
            menu.open(true);

            const build = button("Build");
            expect(build.hasAttribute("aria-describedby")).toBe(false);
            expect(build.parentElement?.hasAttribute("data-merge-tooltip")).toBe(false);
            build.click();

            expect(actions.onBuild).toHaveBeenCalledOnce();
            expect(menu.isOpen()).toBe(false);
        });

        it("hides the rows' section while no shape-less element is listed", () => {
            menu.update({ ...STATE, rows: [] });

            expect(shows(menu.element.querySelector(".merge-menu__rows"))).toBe(false);
        });
    });

    describe("the rows", () => {
        it("names each element with its marker's swatch and offers its decisions as the domain words them", () => {
            menu.open(true);

            expect(rowOf("Message_1")?.querySelector(".merge-menu__row-step")?.textContent).toBe(
                "Order received (Message)",
            );
            expect(
                rowOf("Message_1")?.querySelector(".diff-legend__swatch--merge-conflict"),
            ).not.toBeNull();
            expect(rowButtons("Message_1")).toStrictEqual(["Keep current", "Keep incoming"]);
            expect(rowButtons("Error_1")).toStrictEqual(["Keep current", "Undo pick"]);
            expect(rowOf("Error_1")?.querySelector(".merge-menu__row-step")?.textContent).toBe(
                "Error_1 (Error)",
            );
        });

        it("steps to an element from its name and sends a row's decision with its element", () => {
            menu.open(true);

            rowOf("Message_1")?.querySelector<HTMLButtonElement>(".merge-menu__row-step")?.click();
            button("Keep incoming").click();

            expect(actions.onShapeless).toHaveBeenCalledWith("Message_1");
            expect(actions.onDecide).toHaveBeenCalledWith("Message_1", {
                kind: "keep",
                scope: "element",
                side: "incoming",
            });
        });

        it("marks the row the stepper is on", () => {
            menu.update({ ...STATE, current: "Error_1" });

            expect(
                rowOf("Error_1")
                    ?.querySelector(".merge-menu__row-step")
                    ?.getAttribute("aria-current"),
            ).toBe("true");
            expect(
                rowOf("Message_1")
                    ?.querySelector(".merge-menu__row-step")
                    ?.hasAttribute("aria-current"),
            ).toBe(false);
        });

        it("says in a row what its last decision did, and announces it once", () => {
            menu.update({
                ...STATE,
                rows: [
                    { ...CONFLICT_ROW, outcome: ["Kept from incoming: Order received"] },
                    PICKED_ROW,
                ],
            });
            menu.announce(["Kept from incoming: Order received"]);

            expect(rowOf("Message_1")?.querySelector(".merge-menu__outcome")?.textContent).toBe(
                "Kept from incoming: Order received",
            );
            expect(shows(rowOf("Error_1")?.querySelector(".merge-menu__outcome") ?? null)).toBe(
                false,
            );
            expect(menu.element.querySelector('[role="status"]')?.textContent).toBe(
                "Kept from incoming: Order received",
            );
        });

        it("moves the focus to the row's first decision when its Undo hides itself", () => {
            menu.open(true);
            button("Undo pick").focus();

            menu.update({
                ...STATE,
                rows: [
                    CONFLICT_ROW,
                    {
                        ...PICKED_ROW,
                        marker: "conflict",
                        decisions: CONFLICT_ROW.decisions,
                    },
                ],
            });

            expect(document.activeElement?.textContent).toBe("Keep current");
            expect(rowOf("Error_1")?.contains(document.activeElement)).toBe(true);
        });

        it("keeps the focus on a decision that stays after a repaint", () => {
            menu.open(true);
            const keep =
                rowOf("Message_1")?.querySelectorAll<HTMLButtonElement>(".merge-menu__mini")[1];
            keep?.focus();

            menu.update({
                ...STATE,
                rows: [{ ...CONFLICT_ROW, name: "Order arrived" }, PICKED_ROW],
            });

            expect(document.activeElement?.textContent).toBe("Keep incoming");
            expect(rowOf("Message_1")?.contains(document.activeElement)).toBe(true);
        });

        it("moves the focus to the next row when the row it was in goes away", () => {
            menu.open(true);
            rowOf("Message_1")?.querySelector<HTMLButtonElement>(".merge-menu__mini")?.focus();

            menu.update({ ...STATE, rows: [PICKED_ROW] });

            expect(rowOf("Error_1")?.contains(document.activeElement)).toBe(true);
        });

        it("moves the focus to the row before when the last row it was in goes away", () => {
            menu.open(true);
            rowOf("Error_1")?.querySelector<HTMLButtonElement>(".merge-menu__mini")?.focus();

            menu.update({ ...STATE, rows: [CONFLICT_ROW] });

            expect(rowOf("Message_1")?.contains(document.activeElement)).toBe(true);
        });
    });

    describe("opening and the keyboard", () => {
        it("opens from its button with the focus on the checked list and closes on Escape", () => {
            menu.open(true);
            expect(opener.getAttribute("aria-expanded")).toBe("true");
            expect(document.activeElement).toBe(button("Open conflicts"));

            key("Escape");

            expect(menu.isOpen()).toBe(false);
            expect(opener.getAttribute("aria-expanded")).toBe("false");
            expect(document.activeElement).toBe(opener);
        });

        it("moves through the enabled buttons with the arrow keys, Home and End", () => {
            menu.open(true);

            key("ArrowDown");
            expect(document.activeElement).toBe(button("All merged elements"));
            key("ArrowUp");
            key("ArrowUp");
            // Before a build the comparisons and the notes are disabled, so the last row's Undo ends the list.
            expect(document.activeElement).toBe(button("Undo pick"));
            key("Home");
            expect(document.activeElement).toBe(button("Open conflicts"));
            key("End");
            expect(document.activeElement).toBe(button("Undo pick"));
        });

        it("closes on a click outside it, but not on one inside it or on its button", () => {
            menu.open(false);
            menu.element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
            opener.dispatchEvent(new Event("pointerdown", { bubbles: true }));
            expect(menu.isOpen()).toBe(true);

            outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));

            expect(menu.isOpen()).toBe(false);
        });

        it("opens at a row for a step without taking the focus, and says why it opened", () => {
            const outsideFocus = outside;
            outsideFocus.focus();
            const row = rowOf("Error_1")!;
            const scrolled = vi.spyOn(row, "scrollIntoView");

            menu.openAt("Error_1");

            expect(menu.isOpen()).toBe(true);
            expect(document.activeElement).toBe(outsideFocus);
            expect(scrolled).toHaveBeenCalledWith({ block: "nearest" });
            expect(shows(menu.element.querySelector(".merge-menu__stepped"))).toBe(true);
            expect(menu.element.querySelector(".merge-menu__stepped")?.textContent).toBe(
                "This step has no shape, so it is listed here.",
            );
        });

        it("drops the reason once the user opens it", () => {
            menu.openAt("Error_1");
            menu.close(false);

            menu.open(true);

            expect(shows(menu.element.querySelector(".merge-menu__stepped"))).toBe(false);
        });

        it("tells whether a step opened it", () => {
            expect(menu.openedByStep()).toBe(false);
            menu.openAt("Error_1");
            expect(menu.openedByStep()).toBe(true);
            menu.close(false);
            expect(menu.openedByStep()).toBe(false);
        });
    });
});
