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

// The shared DiffLegendView's spec covers the layout; this one covers the pane's wiring.
describe("DiffLegend", () => {
    it("renders the shared legend with the pane's state and actions", () => {
        const { legend: chip, actions } = legend();

        chip.update({ counts: COUNTS, filename: "shipping-v2.dmn", showSwap: true, canStep: true });
        button(".diff-legend__prev-btn").click();
        button(".diff-legend__next-btn").click();
        button(".diff-legend__swap-btn").click();

        expect(parent.querySelector<HTMLElement>(".diff-legend")?.hidden).toBe(false);
        expect(parent.querySelector(".diff-legend__filename")?.textContent).toBe("shipping-v2.dmn");
        expect(parent.textContent).toContain("Added 2");
        expect(actions.onPrevious).toHaveBeenCalledOnce();
        expect(actions.onNext).toHaveBeenCalledOnce();
        expect(actions.onSwap).toHaveBeenCalledOnce();
    });

    it("names an element's change in the status chip", () => {
        const { legend: chip } = legend();

        chip.update({ status: "removed", showSwap: false, canStep: false });

        expect(parent.querySelector(".diff-legend__slot--status")?.textContent).toBe("Removed");
        expect(button(".diff-legend__next-btn").disabled).toBe(true);
    });

    it("speaks the user's language", () => {
        const { legend: chip } = legend();
        chip.update({ counts: COUNTS, showSwap: false, canStep: true });

        i18n.setLanguage("de");

        expect(parent.textContent).toContain("Hinzugefügt 2");
        expect(button(".diff-legend__next-btn").textContent).toBe("Nächste Änderung ›");
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
        const root = parent.querySelector<HTMLElement>(".diff-legend")!;
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

        expect(parent.querySelector(".diff-legend")).toBeNull();
    });
});

describe("DiffEmptyState", () => {
    it.each([
        ["removed", "It was removed. The version on the left shows it."],
        ["added", "It is new. The version on the right shows it."],
    ] as const)("tells the pane the decision is %s", (status, text) => {
        const card = new DiffEmptyState(parent, vi.fn());

        card.show(status);

        expect(parent.querySelector<HTMLElement>(".dmn-diff-empty")?.hidden).toBe(false);
        expect(parent.querySelector<HTMLElement>(".dmn-diff-empty__card")?.dataset.kind).toBe(
            status,
        );
        expect(parent.textContent).toContain("Not in this version");
        expect(parent.textContent).toContain(text);
        expect(document.body.classList).toContain("dmn-diff-page--missing");
    });

    it("leads back to the DRD and hides again", () => {
        const onViewDrd = vi.fn();
        const card = new DiffEmptyState(parent, onViewDrd);
        card.show("removed");

        parent.querySelector<HTMLButtonElement>(".dmn-diff-empty button")?.click();
        card.show(undefined);

        expect(onViewDrd).toHaveBeenCalledOnce();
        expect(parent.querySelector<HTMLElement>(".dmn-diff-empty")?.hidden).toBe(true);
        expect(document.body.classList).not.toContain("dmn-diff-page--missing");
        card.dispose();
        expect(parent.querySelector(".dmn-diff-empty")).toBeNull();
    });
});
