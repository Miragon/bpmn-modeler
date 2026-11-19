import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MergePaneBuild } from "@miragon/bpmn-modeler-shared";

import {
    type MergeBarActions,
    type MergeBarControls,
    MergeBar,
    type MergeBarState,
} from "./mergeBar";

/** Prefixed to every translated word, so a spec can switch the language. */
let language = "";

const translator = {
    translate: (key: string, replacements: Record<string, string> = {}) =>
        language + key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? name),
    onChange: vi.fn((_listener: () => void) => () => undefined),
};

const BUILD: MergePaneBuild = { canBuild: false, openConflicts: 2, built: false, notes: [] };

const CONTROLS: MergeBarControls = {
    canStep: true,
    total: 2,
    openConflicts: 2,
    stepList: "openConflicts",
    rows: [
        {
            id: "Message_1",
            type: "bpmn:Message",
            marker: "conflict",
            values: { differences: [] },
            decisions: [
                { kind: "keep", scope: "element", side: "current" },
                { kind: "keep", scope: "element", side: "incoming" },
            ],
            xmlChanges: false,
        },
    ],
    shapelessConflicts: 1,
    build: BUILD,
    nameOf: (id) => id,
};

const LEFT: MergeBarState = {
    caption: { side: "current", role: "branch", ref: "main", shortHash: "1a2b3c4" },
    counts: { takenFromThisSide: 1, takenFromOtherSide: 0, conflict: 2 },
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
    const notes = () => parent.querySelector<HTMLElement>(".merge-notes")!;
    const more = () => parent.querySelector<HTMLButtonElement>(".merge-bar__more")!;
    const slot = (modifier: string) =>
        parent.querySelector<HTMLElement>(`.diff-legend__slot--${modifier}`)!;
    const bar = () => parent.querySelector<HTMLElement>(".merge-bar")!;
    const key = (target: Element, name: string) =>
        target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));

    function newBar(state: MergeBarState): MergeBar {
        const created = new MergeBar(parent, actions as unknown as MergeBarActions, translator);
        created.update(state);
        return created;
    }

    function rightBar(controls: Partial<MergeBarControls> = {}): MergeBar {
        return newBar({
            caption: { side: "incoming", role: "upstream", ref: "feature", shortHash: "9f8e7d6" },
            counts: { takenFromThisSide: 1, takenFromOtherSide: 0, conflict: 2 },
            controls: { ...CONTROLS, ...controls },
        });
    }

    beforeEach(() => {
        language = "";
        Element.prototype.scrollIntoView = vi.fn();
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
            onDecide: vi.fn(),
            onCompare: vi.fn(),
            onXmlChanges: vi.fn(),
        };
    });

    afterEach(() => {
        parent.remove();
    });

    it("hides itself, its stepper and its actions until the first states", () => {
        new MergeBar(parent, actions as unknown as MergeBarActions, translator);

        expect(bar().hidden).toBe(true);
        expect(parent.querySelector<HTMLElement>(".merge-bar__nav")?.hidden).toBe(true);
        expect(parent.querySelector<HTMLElement>(".merge-bar__actions")?.hidden).toBe(true);
    });

    describe("the left pane", () => {
        it("shows the caption and the counts it has, nothing to step or build", () => {
            newBar(LEFT);

            expect(parent.querySelector(".merge-bar__caption")?.textContent).toBe(
                "Current: your branch main · 1a2b3c4",
            );
            expect(slot("merge-conflict").textContent).toBe("Conflict 2");
            expect(slot("merge-taken-from-other-side").hidden).toBe(true);
            expect(parent.querySelector<HTMLElement>(".merge-bar__nav")?.hidden).toBe(true);
            expect(parent.querySelector<HTMLElement>(".merge-bar__actions")?.hidden).toBe(true);
        });

        it("says so when it counts nothing", () => {
            newBar({
                ...LEFT,
                counts: { takenFromThisSide: 0, takenFromOtherSide: 0, conflict: 0 },
            });

            expect(parent.querySelector<HTMLElement>(".diff-legend__none")?.hidden).toBe(false);
        });

        it("opens no menu for a step", () => {
            const left = newBar(LEFT);

            left.openMenuAt("Message_1");

            expect(menu().hidden).toBe(true);
        });

        it("adds that its version lacks the plane shown to the caption", () => {
            const left = newBar(LEFT);

            left.showPlaneMissing(true);
            expect(parent.querySelector(".merge-bar__caption")?.textContent).toContain(
                "Not in this version",
            );
            left.showPlaneMissing(false);
            expect(parent.querySelector(".merge-bar__caption")?.textContent).not.toContain(
                "Not in this version",
            );
        });
    });

    describe("the counts", () => {
        it("explain in a tooltip, also their description, what they count and why the other pane counts differently", () => {
            newBar(LEFT);

            const conflict = slot("merge-conflict");
            const tip = conflict.getAttribute("data-merge-tooltip");
            expect(tip).toBe(
                "Conflict: 2. Open conflicts on elements this version has. Elements only the other version has are counted on the other pane only.",
            );
            const description = document.getElementById(conflict.getAttribute("aria-describedby")!);
            expect(description?.textContent).toBe(tip);
        });
    });

    describe("the right pane", () => {
        it("adds the place in the walked list, the menu's button and Build", () => {
            rightBar({ position: { index: 0, total: 2 } });

            expect(parent.querySelector(".merge-bar__position")?.textContent).toBe("1/2");
            expect(
                parent.querySelector(".merge-bar__position")?.getAttribute("data-merge-tooltip"),
            ).toBe("2 open conflicts");
            expect(button("Build").disabled).toBe(true);
            expect(more()).not.toBeNull();
        });

        it("shows the length of the walked list before the first step", () => {
            rightBar({ total: 3 });

            expect(parent.querySelector(".merge-bar__position")?.textContent).toBe("–/3");
        });

        it("steps with ‹ and ›, disabled where there is nothing to walk", () => {
            rightBar();
            button("Prev change").click();
            button("Next change").click();
            expect(actions.onPrevious).toHaveBeenCalledOnce();
            expect(actions.onNext).toHaveBeenCalledOnce();

            rightBar({ canStep: false });
            const disabled = [
                ...parent.querySelectorAll<HTMLButtonElement>(".diff-legend__next-btn"),
            ].at(-1);
            expect(disabled?.disabled).toBe(true);
        });

        it("says why Build is disabled in a tooltip and to screen readers", () => {
            rightBar();

            const build = button("Build");
            const reason = document.getElementById(build.getAttribute("aria-describedby")!);
            expect(reason?.textContent).toBe("2 conflicts left");
            expect(build.parentElement?.getAttribute("data-merge-tooltip")).toBe(
                "2 conflicts left",
            );
            build.click();
            expect(actions.onBuild).not.toHaveBeenCalled();
        });

        it("builds once no conflict is open", () => {
            rightBar({ build: { ...BUILD, canBuild: true, openConflicts: 0 } });

            const build = button("Build");
            build.click();

            expect(actions.onBuild).toHaveBeenCalledOnce();
            expect(build.hasAttribute("aria-describedby")).toBe(false);
            expect(build.parentElement?.hasAttribute("data-merge-tooltip")).toBe(false);
        });

        it("counts the open conflicts without a shape on the menu's button, in its name too, and hides the count at 0", () => {
            rightBar();
            expect(parent.querySelector<HTMLElement>(".merge-bar__badge")?.hidden).toBe(false);
            expect(parent.querySelector(".merge-bar__badge")?.textContent).toBe("1");
            expect(more().getAttribute("aria-label")).toBe(
                "More actions, 1 open conflict not visible in the diagram",
            );

            parent.replaceChildren();
            rightBar({ shapelessConflicts: 0 });
            expect(parent.querySelector<HTMLElement>(".merge-bar__badge")?.hidden).toBe(true);
            expect(more().getAttribute("aria-label")).toBe("More actions");
        });
    });

    describe("the menu", () => {
        it("opens and closes from its button, which says whether it is open", () => {
            rightBar();

            more().click();
            expect(menu().hidden).toBe(false);
            expect(more().getAttribute("aria-expanded")).toBe("true");
            expect(more().getAttribute("aria-controls")).toBe(menu().id);

            more().click();
            expect(menu().hidden).toBe(true);
        });

        it("hands a row's decision and a step to its element on", () => {
            rightBar();
            more().click();

            button("Keep current").click();
            parent.querySelector<HTMLButtonElement>(".merge-menu__row-step")?.click();

            expect(actions.onDecide).toHaveBeenCalledWith("Message_1", {
                kind: "keep",
                scope: "element",
                side: "current",
            });
            expect(actions.onShapeless).toHaveBeenCalledWith("Message_1");
        });

        it("opens at a row for a step, leaving the keyboard on ›, and closes on Escape there", () => {
            const right = rightBar({ current: "Message_1" });
            const next = button("Next change");
            next.focus();

            right.openMenuAt("Message_1");
            expect(menu().hidden).toBe(false);
            expect(document.activeElement).toBe(next);

            key(next, "Escape");
            expect(menu().hidden).toBe(true);
            expect(document.activeElement).toBe(next);
        });

        it("closes when a step lands on a drawn element, only if a step opened it", () => {
            const right = rightBar();
            right.openMenuAt("Message_1");
            right.closeMenuOpenedByStep();
            expect(menu().hidden).toBe(true);

            more().click();
            right.closeMenuOpenedByStep();
            expect(menu().hidden).toBe(false);
        });

        it("opens the notes of the build in their popover from Review notes", () => {
            rightBar({
                build: {
                    canBuild: true,
                    openConflicts: 0,
                    built: true,
                    notes: [{ kind: "shapesOverlap", ids: ["Task_A", "Task_B"] }],
                },
            });
            more().click();

            button("Review notes (1)").click();

            expect(menu().hidden).toBe(true);
            expect(notes().hidden).toBe(false);
            expect(notes().textContent).toContain("Task_A and Task_B lie on top of each other");
            button("Task_B").click();
            expect(actions.onSelect).toHaveBeenCalledWith("Task_B");

            more().click();
            expect(notes().hidden).toBe(true);
            expect(menu().hidden).toBe(false);
        });
    });

    describe("a narrow pane", () => {
        /** jsdom lays nothing out, so each part reports overflowing until the fit drops `cleared`. */
        function overflowUntil(cleared: string | undefined) {
            for (const part of [".merge-bar__row", ".merge-bar__caption", ".merge-bar__counts"]) {
                const element = parent.querySelector<HTMLElement>(part)!;
                Object.defineProperty(element, "clientWidth", {
                    configurable: true,
                    get: () => 100,
                });
                Object.defineProperty(element, "scrollWidth", {
                    configurable: true,
                    get: () => (bar().dataset.fit === cleared ? 100 : 200),
                });
            }
        }

        // The stylesheet keys on these attributes only, never on the fit's name.
        const effectsOnBar = () =>
            ["detailHidden", "labelsHidden", "buildInMenu", "compact"].filter(
                (effect) => bar().dataset[effect] !== undefined,
            );

        it("drops the caption's branch and commit first, keeping them in the caption's tooltip", () => {
            const right = rightBar();
            overflowUntil("withoutDetail");

            right.showPlaneMissing(false);

            expect(bar().dataset.fit).toBe("withoutDetail");
            expect(
                parent.querySelector(".merge-bar__caption")?.getAttribute("data-merge-tooltip"),
            ).toBe("Incoming: other branch feature · 9f8e7d6");
        });

        it("then the counts' labels, which their tooltips keep", () => {
            const right = rightBar();
            overflowUntil("withoutLabels");

            right.showPlaneMissing(false);

            expect(bar().dataset.fit).toBe("withoutLabels");
            expect(slot("merge-conflict").getAttribute("data-merge-tooltip")).toContain(
                "Conflict: 2.",
            );
        });

        it("then moves Build into the menu as its first item, which says why it is disabled", () => {
            const right = rightBar();
            overflowUntil("withoutBuild");

            right.showPlaneMissing(false);
            more().click();

            expect(bar().dataset.fit).toBe("withoutBuild");
            expect(effectsOnBar()).toStrictEqual(["detailHidden", "labelsHidden", "buildInMenu"]);
            const build = menu().querySelector<HTMLButtonElement>("button")!;
            expect(build.textContent).toBe("Build");
            expect(build.disabled).toBe(true);
            expect(
                document.getElementById(build.getAttribute("aria-describedby")!)?.textContent,
            ).toBe("2 conflicts left");
        });

        it("builds from the menu once no conflict is open", () => {
            const right = rightBar({ build: { ...BUILD, canBuild: true, openConflicts: 0 } });
            overflowUntil("withoutBuild");
            right.showPlaneMissing(false);
            more().click();

            menu().querySelector<HTMLButtonElement>("button")!.click();

            expect(actions.onBuild).toHaveBeenCalledOnce();
        });

        it("then tightens its gaps, keeping Build in the menu, where nothing else fits", () => {
            const right = rightBar();
            overflowUntil(undefined);

            right.showPlaneMissing(false);

            expect(bar().dataset.fit).toBe("compact");
            expect(effectsOnBar()).toStrictEqual([
                "detailHidden",
                "labelsHidden",
                "buildInMenu",
                "compact",
            ]);
            expect(menu().querySelector<HTMLButtonElement>("button")?.textContent).toBe("Build");
        });

        it("takes Build back from the menu once the bar has room again", () => {
            const right = rightBar();
            overflowUntil("withoutBuild");
            right.showPlaneMissing(false);
            overflowUntil("full");

            right.showPlaneMissing(false);

            expect(
                menu().querySelector<HTMLElement>(".merge-menu__build")?.closest("[hidden]"),
            ).not.toBeNull();
        });

        it("says it all where it fits, with no tooltip on the caption", () => {
            const right = rightBar();
            overflowUntil("full");

            right.showPlaneMissing(false);

            expect(bar().dataset.fit).toBe("full");
            expect(effectsOnBar()).toStrictEqual([]);
            expect(
                parent.querySelector(".merge-bar__caption")?.hasAttribute("data-merge-tooltip"),
            ).toBe(false);
        });
    });

    it("keeps --diff-legend-height on the page at its height, as the diff's bar does", () => {
        const observed: ResizeObserverCallback[] = [];
        vi.stubGlobal(
            "ResizeObserver",
            class {
                constructor(callback: ResizeObserverCallback) {
                    observed.push(callback);
                }
                observe = vi.fn();
                disconnect = vi.fn();
            },
        );
        const left = newBar(LEFT);
        Object.defineProperty(bar(), "offsetHeight", { configurable: true, get: () => 40 });
        const target = document.createElement("div");

        left.reserveRoomOn(target);
        for (const callback of observed) callback([], {} as ResizeObserver);

        expect(target.style.getPropertyValue("--diff-legend-height")).toBe("40px");
        vi.unstubAllGlobals();
    });

    it("writes its words, its menu's and its notes' again when the language changes", () => {
        rightBar({
            build: { canBuild: false, openConflicts: 1, built: true, notes: [] },
        });
        const relisten = translator.onChange.mock.calls.at(-1)?.[0];

        language = "de:";
        relisten?.();

        expect(parent.querySelector(".merge-bar__caption")?.textContent).toBe(
            "de:Incoming: de:other branch feature · 9f8e7d6",
        );
        expect(slot("merge-conflict").textContent).toBe("de:Conflict 2");
        expect(button("de:Build").parentElement?.getAttribute("data-merge-tooltip")).toBe(
            "de:1 conflict left",
        );
        expect(more().getAttribute("aria-label")).toBe(
            "de:More actions, de:1 open conflict not visible in the diagram",
        );
        expect(menu().querySelector(".merge-menu__heading")?.textContent).toBe("de:Step through");
        expect(menu().querySelector(".merge-menu__row-picks button")?.textContent).toBe(
            "de:Keep current",
        );
        expect(notes().querySelector(".merge-notes__close")?.getAttribute("aria-label")).toBe(
            "de:Close",
        );
    });
});
