import { afterEach, describe, expect, it } from "vitest";

import { DiffCounts } from "@miragon/bpmn-modeler-diff";

import { DiffLegend, DiffLegendCallbacks } from "./DiffLegend";

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
    const q = (sel: string) => parent.querySelector(sel) as HTMLElement | null;
    return { parent, legend, q };
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("DiffLegend", () => {
    it("stays hidden until update is called, then reveals", () => {
        const { legend, q } = mount();
        expect(q(".diff-legend")!.style.display).toBe("none");

        legend.update({ counts: SOME_CHANGES });
        expect(q(".diff-legend")!.style.display).toBe("flex");
    });

    it("disables the nav buttons when there are no changes", () => {
        const { legend, parent } = mount();
        legend.update({ counts: NO_CHANGES });
        const buttons = parent.querySelectorAll<HTMLButtonElement>(".diff-legend__nav-btn");
        const [prev, next] = buttons;
        expect(prev.disabled).toBe(true);
        expect(next.disabled).toBe(true);

        legend.update({ counts: SOME_CHANGES });
        expect(prev.disabled).toBe(false);
        expect(next.disabled).toBe(false);
    });

    it("shows the filename subtitle only when a filename is supplied", () => {
        const { legend, q } = mount();

        legend.update({ counts: SOME_CHANGES, filename: "before.bpmn" });
        expect(q(".diff-legend__filename")!.style.display).toBe("block");
        expect(q(".diff-legend__filename")!.textContent).toBe("before.bpmn");

        legend.update({ counts: SOME_CHANGES });
        expect(q(".diff-legend__filename")!.style.display).toBe("none");
    });

    it("keeps the swap button hidden when no onSwap callback was supplied", () => {
        const { legend, q } = mount(); // no onSwap
        legend.update({ counts: SOME_CHANGES, showSwap: true });
        expect(q(".diff-legend__swap-btn")!.style.display).toBe("none");
    });

    it("toggles the swap button by showSwap when onSwap is supplied", () => {
        let swapped = 0;
        const { legend, q } = mount({ onSwap: () => (swapped += 1) });

        legend.update({ counts: SOME_CHANGES, showSwap: true });
        const swap = q(".diff-legend__swap-btn")!;
        expect(swap.style.display).toBe("inline-flex");
        swap.click();
        expect(swapped).toBe(1);

        legend.update({ counts: SOME_CHANGES, showSwap: false });
        expect(swap.style.display).toBe("none");
    });

    it("removes itself from the DOM on destroy", () => {
        const { legend, parent } = mount();
        legend.update({ counts: SOME_CHANGES });

        legend.destroy();
        expect(parent.querySelector(".diff-legend")).toBeNull();
    });
});
