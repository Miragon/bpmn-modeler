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

function mount(withSwap = true) {
    const actions = {
        onPrevious: vi.fn(),
        onNext: vi.fn(),
        onSwap: withSwap ? vi.fn() : undefined,
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
        expect(previous.textContent).toBe("‹ Prev change");
        expect(next.textContent).toBe("Next change ›");
        expect(actions.onPrevious).toHaveBeenCalledOnce();
        expect(actions.onNext).toHaveBeenCalledOnce();
    });

    it("names the file above the counts only when it has one", () => {
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
        expect(find(".diff-legend__prev-btn").textContent).toBe("‹ Vorherige Änderung");
        expect(find(".diff-legend__next-btn").textContent).toBe("Nächste Änderung ›");
        expect(find(".diff-legend__swap-btn").title).toBe("Seiten tauschen");
    });

    it("goes away and stops listening for language changes when destroyed", () => {
        const { view } = mount();

        view.destroy();

        expect(parent.querySelector(".diff-legend")).toBeNull();
        expect(translator.listenerCount).toBe(0);
    });
});
