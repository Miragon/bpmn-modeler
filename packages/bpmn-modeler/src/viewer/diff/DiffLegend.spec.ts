import { afterEach, describe, expect, it, vi } from "vitest";

import { DiffCounts } from "@miragon/bpmn-modeler-diff";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import { DiffLegend, DiffLegendCallbacks } from "./DiffLegend";

// The shared DiffLegendView's spec covers the layout; this one covers the published API's wiring.

const NO_CHANGES: DiffCounts = { added: 0, removed: 0, changed: 0, layoutChanged: 0 };
const SOME_CHANGES: DiffCounts = { added: 1, removed: 0, changed: 2, layoutChanged: 0 };

function mount(callbacks: Partial<DiffLegendCallbacks> = {}) {
    const parent = document.createElement("div");
    document.body.append(parent);
    const legend = new DiffLegend(parent, {
        onPrevious: () => undefined,
        onNext: () => undefined,
        ...callbacks,
    });
    const q = <T extends HTMLElement = HTMLElement>(sel: string) => parent.querySelector<T>(sel)!;
    return { parent, legend, q };
}

afterEach(() => {
    document.body.innerHTML = "";
    i18n.setLanguage("en");
});

describe("DiffLegend", () => {
    it("renders the shared legend, hidden until update is called", () => {
        const { legend, q } = mount();
        const hiddenBefore = q(".diff-legend").hidden;

        legend.update({ counts: SOME_CHANGES, filename: "before.bpmn" });

        expect(hiddenBefore).toBe(true);
        expect(q(".diff-legend").hidden).toBe(false);
        expect(q(".diff-legend__filename").textContent).toBe("before.bpmn");
        expect(q(".diff-legend__slot--changed").textContent).toBe("Changed 2");
    });

    it("steps by the callbacks and as far as the consumer says it can", () => {
        const onPrevious = vi.fn();
        const onNext = vi.fn();
        const { legend, q } = mount({ onPrevious, onNext });
        const prev = q<HTMLButtonElement>(".diff-legend__prev-btn");
        const next = q<HTMLButtonElement>(".diff-legend__next-btn");

        legend.update({ counts: SOME_CHANGES, canStep: false });
        const disabledWithoutStep = [prev.disabled, next.disabled];
        legend.update({ counts: SOME_CHANGES, canStep: true });
        prev.click();
        next.click();

        expect(disabledWithoutStep).toEqual([true, true]);
        expect(onPrevious).toHaveBeenCalledOnce();
        expect(onNext).toHaveBeenCalledOnce();
    });

    it("falls back to the counts when the consumer does not say whether it can step", () => {
        const { legend, q } = mount();
        const next = q<HTMLButtonElement>(".diff-legend__next-btn");

        legend.update({ counts: NO_CHANGES });
        const disabledWithoutChanges = next.disabled;
        legend.update({ counts: SOME_CHANGES });

        expect(disabledWithoutChanges).toBe(true);
        expect(next.disabled).toBe(false);
    });

    it("keeps the swap button hidden when no onSwap callback was supplied", () => {
        const { legend, q } = mount();

        legend.update({ counts: SOME_CHANGES, showSwap: true });

        expect(q(".diff-legend__swap-group").hidden).toBe(true);
    });

    it("shows the swap button by showSwap, hidden by default, when onSwap is supplied", () => {
        const onSwap = vi.fn();
        const { legend, q } = mount({ onSwap });

        legend.update({ counts: SOME_CHANGES });
        const hiddenByDefault = q(".diff-legend__swap-group").hidden;
        legend.update({ counts: SOME_CHANGES, showSwap: true });
        q(".diff-legend__swap-btn").click();

        expect(hiddenByDefault).toBe(true);
        expect(q(".diff-legend__swap-group").hidden).toBe(false);
        expect(onSwap).toHaveBeenCalledOnce();
    });

    it("speaks the shared translator's language", () => {
        const { legend, q } = mount();
        legend.update({ counts: SOME_CHANGES });

        i18n.setLanguage("de");

        expect(q(".diff-legend__next-btn").textContent).toBe("Nächste Änderung ›");
    });

    it("removes itself from the DOM on destroy", () => {
        const { legend, parent } = mount();
        legend.update({ counts: SOME_CHANGES });

        legend.destroy();

        expect(parent.querySelector(".diff-legend")).toBeNull();
    });
});
