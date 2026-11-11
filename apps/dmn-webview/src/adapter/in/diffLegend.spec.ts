import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "@miragon/bpmn-modeler-i18n";

import { DiffEmptyState, DiffLegend } from "./diffLegend";

const COUNTS = { added: 2, removed: 1, changed: 3, layoutChanged: 1 };

let parent: HTMLElement;

beforeEach(() => {
    parent = document.createElement("div");
    document.body.append(parent);
});

afterEach(() => {
    parent.remove();
    i18n.setLanguage("en");
    document.body.className = "";
    document.body.style.removeProperty("--dmn-diff-chrome-height");
    vi.unstubAllGlobals();
});

function legend() {
    const actions = { onPrevious: vi.fn(), onNext: vi.fn(), onSwap: vi.fn() };
    return { legend: new DiffLegend(parent, actions), actions };
}

const button = (selector: string) => parent.querySelector<HTMLButtonElement>(selector)!;

describe("DiffLegend", () => {
    it("stays hidden until it has something to show", () => {
        legend();

        expect(parent.querySelector<HTMLElement>(".dmn-diff-legend")?.hidden).toBe(true);
    });

    it("counts the changes and steps through them", () => {
        const { legend: chip, actions } = legend();

        chip.update({ counts: COUNTS, showSwap: false, canStep: true });
        button(".dmn-diff-legend__previous").click();
        button(".dmn-diff-legend__next").click();

        expect(parent.textContent).toContain("Added 2");
        expect(parent.textContent).toContain("Moved 1");
        expect(actions.onPrevious).toHaveBeenCalledOnce();
        expect(actions.onNext).toHaveBeenCalledOnce();
        expect(parent.querySelector(".dmn-diff-legend")?.getAttribute("aria-label")).toBe(
            "Changes",
        );
    });

    it("names an element's change instead of counts and cannot step without changes", () => {
        const { legend: chip } = legend();

        chip.update({ status: "removed", showSwap: false, canStep: false });

        expect(
            parent.querySelector('.dmn-diff-legend__swatch[data-kind="removed"]'),
        ).not.toBeNull();
        expect(parent.textContent).not.toContain("Added");
        expect(button(".dmn-diff-legend__next").disabled).toBe(true);
    });

    it("names the file and swaps the sides of a compare-files diff", () => {
        const { legend: chip, actions } = legend();

        chip.update({ counts: COUNTS, filename: "shipping-v2.dmn", showSwap: true, canStep: true });
        button(".dmn-diff-legend__swap").click();

        expect(parent.querySelector(".dmn-diff-legend__file")?.textContent).toBe("shipping-v2.dmn");
        expect(button(".dmn-diff-legend__swap").title).toBe("Swap sides");
        expect(actions.onSwap).toHaveBeenCalledOnce();
    });

    it("speaks the user's language", () => {
        const { legend: chip } = legend();
        chip.update({ counts: COUNTS, showSwap: false, canStep: true });

        i18n.setLanguage("de");

        expect(parent.textContent).toContain("Hinzugefügt 2");
        expect(button(".dmn-diff-legend__next").textContent).toBe("Nächste Änderung ›");
    });

    it("tells the views below how much room it takes", () => {
        const observer = { callback: () => undefined as unknown, disconnect: vi.fn() };
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
        const { legend: chip } = legend();
        const root = parent.querySelector<HTMLElement>(".dmn-diff-legend")!;
        Object.defineProperty(root, "offsetHeight", { value: 88 });
        const room = () => document.body.style.getPropertyValue("--dmn-diff-chrome-height");

        observer.callback();
        const whileHidden = room();
        chip.update({ counts: COUNTS, showSwap: false, canStep: true });
        observer.callback();
        chip.dispose();

        expect(whileHidden).toBe("0px");
        expect(room()).toBe("88px");
        expect(observer.disconnect).toHaveBeenCalledOnce();
    });

    it("goes away when disposed", () => {
        const { legend: chip } = legend();

        chip.dispose();

        expect(parent.querySelector(".dmn-diff-legend")).toBeNull();
    });
});

describe("DiffEmptyState", () => {
    it.each([
        ["after", "removed", "It was removed. The version on the left shows it."],
        ["before", "added", "It is new. The version on the right shows it."],
    ] as const)("tells the %s pane the decision is %s", (side, kind, text) => {
        const card = new DiffEmptyState(parent, vi.fn());

        card.show(side);

        expect(parent.querySelector<HTMLElement>(".dmn-diff-empty")?.hidden).toBe(false);
        expect(parent.querySelector<HTMLElement>(".dmn-diff-empty__card")?.dataset.kind).toBe(kind);
        expect(parent.textContent).toContain("Not in this version");
        expect(parent.textContent).toContain(text);
        expect(document.body.classList).toContain("dmn-diff-page--missing");
    });

    it("leads back to the DRD and hides again", () => {
        const onViewDrd = vi.fn();
        const card = new DiffEmptyState(parent, onViewDrd);
        card.show("after");

        parent.querySelector<HTMLButtonElement>(".dmn-diff-empty button")?.click();
        card.show(undefined);

        expect(onViewDrd).toHaveBeenCalledOnce();
        expect(parent.querySelector<HTMLElement>(".dmn-diff-empty")?.hidden).toBe(true);
        expect(document.body.classList).not.toContain("dmn-diff-page--missing");
        card.dispose();
        expect(parent.querySelector(".dmn-diff-empty")).toBeNull();
    });
});
