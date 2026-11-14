import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiffCounts } from "./diff";
import { type DiffLegendState, DiffLegendView, type DiffLegendTranslator } from "./diffLegendView";

const COUNTS: DiffCounts = { added: 3, removed: 1, changed: 2, layoutChanged: 4 };
const SHOWN: DiffLegendState = { counts: COUNTS, showSwap: false, canStep: true };

const GERMAN: Readonly<Record<string, string>> = {
    "Changes": "Änderungen",
    "Added": "Hinzugefügt",
    "Removed": "Entfernt",
    "Changed": "Geändert",
    "Moved": "Verschoben",
    "Prev change": "Vorherige Änderung",
    "Next change": "Nächste Änderung",
    "Swap sides": "Seiten tauschen",
    "No changes": "Keine Änderungen",
    "Show all": "Alle anzeigen",
};

class SwitchableTranslator implements DiffLegendTranslator {
    private german = false;
    private readonly listeners = new Set<() => void>();

    translate(key: string): string {
        return this.german ? (GERMAN[key] ?? key) : key;
    }

    onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    speakGerman(): void {
        this.german = true;
        this.listeners.forEach((listener) => listener());
    }

    get listenerCount(): number {
        return this.listeners.size;
    }
}

let parent: HTMLElement;
let translator: SwitchableTranslator;

beforeEach(() => {
    parent = document.createElement("div");
    document.body.append(parent);
    translator = new SwitchableTranslator();
});

afterEach(() => {
    parent.remove();
});

function mount(withSwap = true, withShowAll = true) {
    const actions = {
        onPrevious: vi.fn(),
        onNext: vi.fn(),
        onSwap: withSwap ? vi.fn() : undefined,
        onShowAll: withShowAll ? vi.fn() : undefined,
    };
    const view = new DiffLegendView(parent, actions, translator);
    return { view, actions };
}

const find = <T extends HTMLElement = HTMLElement>(selector: string) =>
    parent.querySelector<T>(selector)!;
const visible = (selector: string) => !find(selector).hidden;
const visibleSlots = () =>
    [...parent.querySelectorAll<HTMLElement>(".diff-legend__slot")].filter((slot) => !slot.hidden);
const visibleSlotTexts = () => visibleSlots().map((slot) => slot.textContent);

describe("DiffLegendView", () => {
    it("stays hidden until it has something to show", () => {
        const { view } = mount();
        const hiddenBefore = view.element.hidden;

        view.update(SHOWN);

        expect(hiddenBefore).toBe(true);
        expect(view.element.hidden).toBe(false);
        expect(view.element.parentElement).toBe(parent);
    });

    it("labels each count slot with its category, a swatch and a bold count", () => {
        const { view } = mount();

        view.update(SHOWN);

        const slots = visibleSlots();
        expect(visibleSlotTexts()).toEqual(["Added 3", "Removed 1", "Changed 2", "Moved 4"]);
        expect(slots.map((slot) => slot.querySelector(".diff-legend__count")?.tagName)).toEqual([
            "B",
            "B",
            "B",
            "B",
        ]);
        expect(slots.map((slot) => slot.querySelector(".diff-legend__swatch")?.className)).toEqual([
            "diff-legend__swatch diff-legend__swatch--added",
            "diff-legend__swatch diff-legend__swatch--removed",
            "diff-legend__swatch diff-legend__swatch--changed",
            "diff-legend__swatch diff-legend__swatch--layout",
        ]);
    });

    it("steps through the changes only when there is one to step to", () => {
        const { view, actions } = mount();
        const previous = find<HTMLButtonElement>(".diff-legend__prev-btn");
        const next = find<HTMLButtonElement>(".diff-legend__next-btn");

        view.update({ ...SHOWN, canStep: false });
        const disabledWithoutStep = [previous.disabled, next.disabled];
        view.update({ ...SHOWN, canStep: true });
        previous.click();
        next.click();

        expect(disabledWithoutStep).toEqual([true, true]);
        expect([previous.disabled, next.disabled]).toEqual([false, false]);
        expect(actions.onPrevious).toHaveBeenCalledOnce();
        expect(actions.onNext).toHaveBeenCalledOnce();
    });

    it("steps with icon-only buttons named by their title and label", () => {
        mount();
        const previous = find<HTMLButtonElement>(".diff-legend__prev-btn");
        const next = find<HTMLButtonElement>(".diff-legend__next-btn");

        expect([previous.textContent, next.textContent]).toEqual(["", ""]);
        expect([previous.title, previous.getAttribute("aria-label")]).toEqual([
            "Prev change",
            "Prev change",
        ]);
        expect([next.title, next.getAttribute("aria-label")]).toEqual([
            "Next change",
            "Next change",
        ]);
        expect(previous.querySelector("svg")).not.toBeNull();
        expect(next.querySelector("svg")).not.toBeNull();
    });

    it("shows only the categories that changed", () => {
        const { view } = mount();

        view.update({ ...SHOWN, counts: { added: 3, removed: 0, changed: 2, layoutChanged: 0 } });

        expect(visibleSlotTexts()).toEqual(["Added 3", "Changed 2"]);
        expect(visible(".diff-legend__none")).toBe(false);
    });

    it("says so when nothing changed", () => {
        const { view } = mount();

        view.update({
            counts: { added: 0, removed: 0, changed: 0, layoutChanged: 0 },
            showSwap: false,
            canStep: false,
        });

        expect(visibleSlotTexts()).toEqual([]);
        expect(visible(".diff-legend__none")).toBe(true);
        expect(find(".diff-legend__none").textContent).toBe("No changes");
    });

    it("shows which change the stepper is on, once it is on one", () => {
        const { view } = mount();

        view.update(SHOWN);
        const shownBeforeStepping = visible(".diff-legend__position");
        view.update({ ...SHOWN, position: { index: 2, total: 8 } });

        expect(shownBeforeStepping).toBe(false);
        expect(visible(".diff-legend__position")).toBe(true);
        expect(find(".diff-legend__position").textContent).toBe("3/8");
    });

    it("goes back to the whole diagram with Show all, once there is a change to step to", () => {
        const { view, actions } = mount();
        const showAll = find<HTMLButtonElement>(".diff-legend__show-all-btn");

        view.update({ ...SHOWN, canStep: false });
        const disabledWithoutStep = showAll.disabled;
        view.update(SHOWN);
        showAll.click();
        translator.speakGerman();

        expect(disabledWithoutStep).toBe(true);
        expect(actions.onShowAll).toHaveBeenCalledOnce();
        expect(showAll.textContent).toBe("Alle anzeigen");
    });

    it("offers no Show all without its action", () => {
        const { view } = mount(true, false);

        view.update(SHOWN);

        expect(visible(".diff-legend__show-all-btn")).toBe(false);
    });

    it("can stay an empty bar, for a pane whose partner's bar shows the changes", () => {
        const { view } = mount();

        view.update({ ...SHOWN, showSwap: true, showChanges: false });

        expect(view.element.hidden).toBe(false);
        expect(visible(".diff-legend__counts")).toBe(false);
    });

    it("names the file before the counts only when it has one", () => {
        const { view } = mount();

        view.update({ ...SHOWN, filename: "after.bpmn" });
        const withFile = visible(".diff-legend__filename");
        const text = find(".diff-legend__filename").textContent;
        view.update(SHOWN);

        expect(withFile).toBe(true);
        expect(text).toBe("after.bpmn");
        expect(visible(".diff-legend__filename")).toBe(false);
    });

    it("offers the icon-only swap button when asked to and it can swap", () => {
        const { view, actions } = mount();
        const swap = find<HTMLButtonElement>(".diff-legend__swap-btn");

        view.update({ ...SHOWN, showSwap: true });
        const shown = visible(".diff-legend__swap-group");
        swap.click();
        view.update({ ...SHOWN, showSwap: false });

        expect(shown).toBe(true);
        expect(swap.textContent).toBe("⇄");
        expect(swap.title).toBe("Swap sides");
        expect(swap.getAttribute("aria-label")).toBe("Swap sides");
        expect(actions.onSwap).toHaveBeenCalledOnce();
        expect(visible(".diff-legend__swap-group")).toBe(false);
    });

    it("never offers the swap button without a swap action", () => {
        const { view } = mount(false);

        view.update({ ...SHOWN, showSwap: true });

        expect(visible(".diff-legend__swap-group")).toBe(false);
    });

    it("names a single change in a status chip instead of counts", () => {
        const { view } = mount();

        view.update({ status: "removed", showSwap: false, canStep: false });

        const status = find(".diff-legend__slot--status");
        expect(status.hidden).toBe(false);
        expect(status.textContent).toBe("Removed");
        expect(status.querySelector(".diff-legend__swatch--removed")).not.toBeNull();
        expect(visibleSlotTexts()).toEqual(["Removed"]);
    });

    it("adds the status chip first in the row, and only once a status needs it", () => {
        const { view } = mount();

        view.update(SHOWN);
        const slotBeforeStatus = parent.querySelector(".diff-legend__slot--status");
        view.update({ status: "added", showSwap: false, canStep: false });

        expect(slotBeforeStatus).toBeNull();
        expect(find(".diff-legend__counts").firstElementChild).toBe(
            find(".diff-legend__slot--status"),
        );
    });

    it("hides the status chip when it shows counts", () => {
        const { view } = mount();

        view.update({ status: "added", showSwap: false, canStep: false });
        view.update(SHOWN);

        expect(visible(".diff-legend__slot--status")).toBe(false);
        expect(visibleSlotTexts()).toEqual(["Added 3", "Removed 1", "Changed 2", "Moved 4"]);
    });

    it("is a toolbar named as the changes", () => {
        const { view } = mount();

        view.update(SHOWN);

        expect(view.element.getAttribute("role")).toBe("toolbar");
        expect(view.element.getAttribute("aria-label")).toBe("Changes");
    });

    it("speaks the user's language when it changes", () => {
        const { view } = mount();
        view.update({ ...SHOWN, showSwap: true });

        translator.speakGerman();

        expect(view.element.getAttribute("aria-label")).toBe("Änderungen");
        expect(parent.textContent).toContain("Hinzugefügt 3");
        expect(parent.textContent).toContain("Verschoben 4");
        expect(find(".diff-legend__prev-btn").title).toBe("Vorherige Änderung");
        expect(find(".diff-legend__next-btn").getAttribute("aria-label")).toBe("Nächste Änderung");
        expect(find(".diff-legend__swap-btn").title).toBe("Seiten tauschen");
    });

    it("keeps the bar's height on its target once it shows, and stops when destroyed", () => {
        const observer = { callback: () => undefined as void, disconnect: vi.fn() };
        vi.stubGlobal(
            "ResizeObserver",
            class {
                readonly observe = vi.fn();
                readonly disconnect = observer.disconnect;
                constructor(callback: () => void) {
                    observer.callback = callback;
                }
            },
        );
        const { view } = mount();
        const target = document.createElement("div");
        view.reserveRoomOn(target);
        const room = () => target.style.getPropertyValue("--diff-legend-height");

        observer.callback();
        const whileHidden = room();
        Object.defineProperty(view.element, "offsetHeight", { value: 64 });
        observer.callback();
        view.destroy();
        vi.unstubAllGlobals();

        expect(whileHidden).toBe("");
        expect(room()).toBe("64px");
        expect(observer.disconnect).toHaveBeenCalledOnce();
    });

    it("goes away and stops listening for language changes when destroyed", () => {
        const { view } = mount();

        view.destroy();

        expect(parent.querySelector(".diff-legend")).toBeNull();
        expect(translator.listenerCount).toBe(0);
    });
});
