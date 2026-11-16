import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MergePaneBuild } from "@miragon/bpmn-modeler-shared";

import { type MergeBarActions, type MergeBarControls, MergeBar } from "./mergeBar";

const translator = {
    translate: (key: string, replacements: Record<string, string> = {}) =>
        key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? name),
    onChange: () => () => undefined,
};

const BUILD: MergePaneBuild = { canBuild: false, openConflicts: 2, built: false, notes: [] };

const CONTROLS: MergeBarControls = {
    canStep: true,
    total: 2,
    stepList: "openConflicts",
    openConflicts: 2,
    rows: [{ id: "Message_1", type: "bpmn:Message", marker: "conflict" }],
    openShapelessConflicts: 1,
    build: BUILD,
    nameOf: (id) => id,
};

describe("MergeBar", () => {
    let parent: HTMLElement;
    let actions: { [Key in keyof MergeBarActions]: ReturnType<typeof vi.fn> };

    const button = (name: string): HTMLButtonElement => {
        const found = [...parent.querySelectorAll("button")].find(
            (candidate) =>
                candidate.getAttribute("aria-label") === name || candidate.textContent === name,
        );
        if (!found) throw new Error(`no button ${name}`);
        return found;
    };
    const menu = () => parent.querySelector<HTMLElement>(".merge-menu")!;
    const more = () => parent.querySelector<HTMLButtonElement>(".merge-bar__more")!;
    const tooltip = () => document.querySelector<HTMLElement>(".merge-tooltip");
    const key = (target: Element, name: string) =>
        target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

    function rightBar(controls: Partial<MergeBarControls> = {}): MergeBar {
        const bar = new MergeBar(parent, actions as unknown as MergeBarActions, translator);
        bar.update({
            caption: { side: "incoming", role: "upstream", ref: "feature", shortHash: "9f8e7d6" },
            counts: { takenFromThisSide: 1, takenFromOtherSide: 0, conflict: 2 },
            controls: { ...CONTROLS, ...controls },
        });
        return bar;
    }

    beforeEach(() => {
        parent = document.createElement("div");
        document.body.append(parent);
        actions = {
            onPrevious: vi.fn(),
            onNext: vi.fn(),
            onBuild: vi.fn(),
            onSelect: vi.fn(),
            onStepList: vi.fn(),
            onShowAll: vi.fn(),
            onShapeless: vi.fn(),
            onPick: vi.fn(),
            onUnpick: vi.fn(),
            onCompare: vi.fn(),
        };
    });

    afterEach(() => {
        parent.remove();
    });

    it("shows the caption, the counts it has and the place in the walked list on one line", () => {
        rightBar({ position: { index: 0 } });

        expect(parent.textContent).toContain("Incoming: other branch feature · 9f8e7d6");
        expect(parent.querySelector(".diff-legend__slot--merge-conflict")?.textContent).toBe(
            "Conflict 2",
        );
        expect(
            parent.querySelector<HTMLElement>(".diff-legend__slot--merge-taken-from-other-side")
                ?.hidden,
        ).toBe(true);
        expect(parent.querySelector(".diff-legend__position")?.textContent).toBe("1/2");
    });

    it("opens the menu on its list, moves with the arrow keys and closes on Escape", () => {
        rightBar();

        more().click();
        expect(menu().hidden).toBe(false);
        expect(more().getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement).toBe(button("Open conflicts"));

        key(document.activeElement!, "ArrowDown");
        expect(document.activeElement).toBe(button("All merged elements"));
        key(document.activeElement!, "ArrowUp");
        expect(document.activeElement).toBe(button("Open conflicts"));
        // The comparisons and the notes are disabled before a build, so the row's last pick ends the list.
        key(document.activeElement!, "End");
        expect(document.activeElement).toBe(button("Keep incoming"));
        key(document.activeElement!, "Home");
        expect(document.activeElement).toBe(button("Open conflicts"));

        key(document.activeElement!, "Escape");
        expect(menu().hidden).toBe(true);
        expect(document.activeElement).toBe(more());
    });

    it("closes the menu on a click outside it, and on its button again", () => {
        rightBar();
        more().click();

        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        expect(menu().hidden).toBe(true);

        more().click();
        more().click();
        expect(menu().hidden).toBe(true);
    });

    it("opens the menu at a shape-less row without taking the keyboard", () => {
        // jsdom lays nothing out, so it has no scrollIntoView.
        Element.prototype.scrollIntoView = vi.fn();
        const bar = rightBar({ current: "Message_1" });
        const next = button("Next change");
        next.focus();

        bar.openMenuAt("Message_1");

        expect(menu().hidden).toBe(false);
        expect(document.activeElement).toBe(next);
        expect(
            parent.querySelector('[data-element-id="Message_1"]')?.getAttribute("aria-current"),
        ).toBe("true");
    });

    it("opens no menu on the left pane", () => {
        const bar = new MergeBar(parent, actions as unknown as MergeBarActions, translator);
        bar.update({
            caption: { side: "current", role: "branch" },
            counts: { takenFromThisSide: 0, takenFromOtherSide: 0, conflict: 0 },
        });

        bar.openMenuAt("Message_1");

        expect(menu().hidden).toBe(true);
        expect(parent.querySelector<HTMLElement>(".diff-legend__none")?.hidden).toBe(false);
    });

    it("shows a list pick's outcome in its row, and keeps it across a rebuild", () => {
        const bar = rightBar();

        bar.showShapelessOutcome("Message_1", "Kept from incoming: Message_1");
        bar.update({
            caption: { side: "incoming", role: "upstream" },
            counts: { takenFromThisSide: 1, takenFromOtherSide: 0, conflict: 1 },
            controls: {
                ...CONTROLS,
                rows: [{ ...CONTROLS.rows[0], keptSide: "incoming", undo: "element" }],
            },
        });

        const outcome = parent.querySelector<HTMLElement>(".merge-menu__outcome");
        expect(outcome?.hidden).toBe(false);
        expect(outcome?.textContent).toBe("Kept from incoming: Message_1");
        bar.showShapelessOutcome("Message_1", undefined);
        expect(outcome?.hidden).toBe(true);
    });

    it("keeps the keyboard on the row when Undo hides itself", () => {
        const bar = rightBar({
            rows: [{ ...CONTROLS.rows[0], keptSide: "incoming", undo: "element" }],
        });
        more().click();
        button("Undo pick").focus();

        bar.update({
            caption: { side: "incoming", role: "upstream" },
            counts: { takenFromThisSide: 1, takenFromOtherSide: 0, conflict: 2 },
            controls: CONTROLS,
        });

        expect(document.activeElement).toBe(parent.querySelector('[data-element-id="Message_1"]'));
    });

    it("steps, shows all, compares and builds through its buttons", () => {
        rightBar({ build: { ...BUILD, canBuild: true, openConflicts: 0, built: true } });

        button("Prev change").click();
        button("Next change").click();
        button("All merged elements").click();
        button("Show all").click();
        button("Compare with current").click();
        button("Build").click();

        expect(actions.onPrevious).toHaveBeenCalledOnce();
        expect(actions.onNext).toHaveBeenCalledOnce();
        expect(actions.onStepList).toHaveBeenCalledWith("all");
        expect(actions.onShowAll).toHaveBeenCalledOnce();
        expect(actions.onCompare).toHaveBeenCalledWith("current");
        expect(actions.onBuild).toHaveBeenCalledOnce();
    });

    it("lists the build's notes in a popover that Escape closes", () => {
        rightBar({
            build: {
                ...BUILD,
                canBuild: true,
                openConflicts: 0,
                built: true,
                notes: [{ kind: "addedAtSamePlace", ids: ["Task_1", "Task_2"] }],
            },
        });
        more().click();

        button("Review notes (1)").click();
        const notes = parent.querySelector<HTMLElement>(".merge-notes")!;
        expect(notes.hidden).toBe(false);
        expect(menu().hidden).toBe(true);
        button("Task_2").click();
        expect(actions.onSelect).toHaveBeenCalledWith("Task_2");

        key(notes, "Escape");
        expect(notes.hidden).toBe(true);
        expect(document.activeElement).toBe(more());
    });

    it("shows no tooltip for a focus a pointer press gave, so it does not stay after the pointer left", () => {
        rightBar();

        more().dispatchEvent(new Event("pointerdown", { bubbles: true }));
        more().focus();

        expect(tooltip()?.hidden).toBe(true);
    });

    it("gives the disabled Build its reason, and the menu button its count, as tooltips", () => {
        rightBar();

        expect(
            parent.querySelector(".merge-bar__build-wrap")?.getAttribute("data-merge-tooltip"),
        ).toBe("2 conflicts left");
        // Keyboard focus: a focus that follows a pointer press shows no tooltip.
        key(document.body, "Tab");
        more().focus();
        expect(tooltip()?.hidden).toBe(false);
        expect(tooltip()?.textContent).toBe(
            "More merge actions, 1 open conflict not visible in the diagram",
        );
        expect(more().getAttribute("aria-describedby")).toBe("merge-tooltip");

        key(more(), "Escape");
        expect(tooltip()?.hidden).toBe(true);
    });

    it("shows a tooltip on hover and hides it when the pointer leaves", () => {
        rightBar();
        const slot = parent.querySelector(".diff-legend__slot--merge-conflict")!;

        slot.dispatchEvent(new Event("pointerover", { bubbles: true }));
        expect(tooltip()?.textContent).toBe("Conflict: 2");
        expect(tooltip()?.hidden).toBe(false);

        parent.dispatchEvent(new Event("pointerover", { bubbles: true }));
        expect(tooltip()?.hidden).toBe(true);
    });

    it("names the plane its version lacks in the caption", () => {
        const bar = rightBar();

        bar.showPlaneMissing(true);
        expect(parent.textContent).toContain("9f8e7d6 · Not in this version");
        bar.showPlaneMissing(false);
        expect(parent.textContent).not.toContain("Not in this version");
    });
});
