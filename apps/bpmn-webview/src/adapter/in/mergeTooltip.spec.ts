import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installMergeTooltips, MERGE_TOOLTIP_ATTRIBUTE } from "./mergeTooltip";

describe("the merge chrome's tooltip", () => {
    let anchor: HTMLButtonElement;
    let other: HTMLButtonElement;

    const tooltip = () => document.querySelector<HTMLElement>(".merge-tooltip");
    const shown = () => {
        const layer = tooltip();
        return layer && !layer.hidden ? layer.textContent : undefined;
    };
    const pointerMove = (target: Element, clientX: number, clientY = 10) =>
        target.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX, clientY }));
    const key = (name: string) =>
        document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: name }));
    const pointerDown = (target: Element) =>
        target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    beforeEach(() => {
        installMergeTooltips(document);
        anchor = document.createElement("button");
        anchor.setAttribute(MERGE_TOOLTIP_ATTRIBUTE, "Keep incoming: Keep it as incoming has it");
        anchor.setAttribute("aria-label", "Keep incoming");
        anchor.innerHTML = "<svg></svg>";
        other = document.createElement("button");
        document.body.append(anchor, other);
    });

    afterEach(() => {
        key("Escape");
        anchor.remove();
        other.remove();
    });

    it("shows on hover, as a tooltip the anchor's description names", () => {
        pointerMove(anchor.querySelector("svg")!, 5);

        expect(shown()).toBe("Keep incoming: Keep it as incoming has it");
        expect(tooltip()?.getAttribute("role")).toBe("tooltip");
        expect(anchor.getAttribute("aria-describedby")).toBe(tooltip()?.id);
    });

    it("hides once the pointer moves off the anchor", () => {
        pointerMove(anchor, 5);

        pointerMove(other, 50);

        expect(shown()).toBeUndefined();
        expect(anchor.hasAttribute("aria-describedby")).toBe(false);
    });

    it("does not show for an anchor that appears under a resting pointer", () => {
        pointerMove(other, 5);

        pointerMove(anchor, 5);

        expect(shown()).toBeUndefined();
    });

    it("shows on the user's keyboard focus, not on a focus a click gives", () => {
        key("Tab");
        anchor.focus();
        expect(shown()).toBe("Keep incoming: Keep it as incoming has it");
        anchor.blur();
        expect(shown()).toBeUndefined();

        pointerDown(anchor);
        anchor.focus();

        expect(shown()).toBeUndefined();
    });

    it("does not show because the page moved the focus", () => {
        pointerDown(other);

        anchor.focus();

        expect(shown()).toBeUndefined();
    });

    it("hides on Escape, a press and a key that acts", () => {
        const hides = [() => key("Escape"), () => pointerDown(anchor), () => key("Enter")];
        for (const [index, hide] of hides.entries()) {
            pointerMove(anchor, 20 + index);
            expect(shown()).toBeDefined();

            hide();

            expect(shown()).toBeUndefined();
        }
    });

    it("adds no second description where the label already says it all", () => {
        anchor.setAttribute("aria-label", anchor.getAttribute(MERGE_TOOLTIP_ATTRIBUTE)!);

        pointerMove(anchor, 7);

        expect(shown()).toBe("Keep incoming: Keep it as incoming has it");
        expect(anchor.hasAttribute("aria-describedby")).toBe(false);
    });

    it("keeps a description the anchor names itself, while it shows and after", () => {
        anchor.setAttribute("aria-describedby", "own-description");

        pointerMove(anchor, 9);
        expect(shown()).toBe("Keep incoming: Keep it as incoming has it");
        expect(anchor.getAttribute("aria-describedby")).toBe("own-description");
        pointerMove(other, 60);

        expect(anchor.getAttribute("aria-describedby")).toBe("own-description");
    });

    it("keeps one tooltip layer per page however often it is installed", () => {
        installMergeTooltips(document);

        expect(document.querySelectorAll(".merge-tooltip")).toHaveLength(1);
    });
});
