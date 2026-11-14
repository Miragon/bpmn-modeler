import "../../styles/diffView.css";

import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { DiffLegend } from "./DiffLegend";

const WCAG_AA_NORMAL_TEXT_CONTRAST = 4.5;

const mountedRoots: HTMLElement[] = [];

afterEach(() => {
    mountedRoots.forEach((root) => root.remove());
    mountedRoots.length = 0;
    document.body.classList.remove("vscode-high-contrast", "vscode-light");
});

function mountLegend(theme?: "light" | "dark", vscodeThemeVariables = "") {
    const themeRoot = document.createElement("div");
    if (theme) themeRoot.setAttribute("data-bpmn-theme", theme);
    themeRoot.style.cssText = vscodeThemeVariables;
    document.body.append(themeRoot);
    mountedRoots.push(themeRoot);
    new DiffLegend(themeRoot, { onPrevious: () => undefined, onNext: () => undefined }).update({
        counts: { added: 1, removed: 0, changed: 2, layoutChanged: 0 },
    });
    const chip = themeRoot.querySelector<HTMLElement>(".diff-legend")!;
    const prevButton = chip.querySelector<HTMLButtonElement>(".diff-legend__prev-btn")!;
    const nextButton = chip.querySelector<HTMLButtonElement>(".diff-legend__next-btn")!;
    return {
        chip: getComputedStyle(chip),
        prev: getComputedStyle(prevButton),
        next: getComputedStyle(nextButton),
        prevButton,
        nextButton,
    };
}

async function focusByKeyboard(button: HTMLButtonElement) {
    for (let step = 0; step < 10 && document.activeElement !== button; step++) {
        await userEvent.tab();
    }
    expect(document.activeElement).toBe(button);
}

function toSrgbChannels(cssColor: string): [number, number, number] {
    const context = document.createElement("canvas").getContext("2d")!;
    context.fillStyle = cssColor;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return [red, green, blue];
}

function relativeLuminance(cssColor: string): number {
    const [red, green, blue] = toSrgbChannels(cssColor).map((channel) => {
        const normalised = channel / 255;
        return normalised <= 0.03928 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
    const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
        (a, b) => b - a,
    );
    return (lighter + 0.05) / (darker + 0.05);
}

describe("the published diff legend's look", () => {
    it("is a bar along the top edge in the Miragon look: Geist, unfilled icon buttons with 8px radii", () => {
        const { chip, prev, next } = mountLegend();

        expect(chip.fontFamily).toMatch(/^"Geist Variable", Geist, /);
        expect([chip.position, chip.top, chip.left, chip.right]).toEqual([
            "absolute",
            "0px",
            "0px",
            "0px",
        ]);
        expect(chip.borderRadius).toBe("0px");
        expect(chip.borderBottomStyle).toBe("solid");
        expect(chip.boxShadow).toBe("none");
        expect(chip.backgroundColor).toBe("rgb(255, 255, 255)");
        expect(next.backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(next.borderRadius).toBe("8px");
        expect(prev.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    });

    it("falls back to the system font where Geist is not loaded", () => {
        expect(mountLegend().chip.fontFamily).toMatch(/system-ui, sans-serif$/);
    });

    it.each(["light", "dark"] as const)("keeps its text readable in %s", (theme) => {
        const { chip, next } = mountLegend(theme);

        expect(contrastRatio(chip.color, chip.backgroundColor)).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL_TEXT_CONTRAST,
        );
        expect(contrastRatio(next.color, chip.backgroundColor)).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL_TEXT_CONTRAST,
        );
    });

    it("takes its surface from the VS Code widget colours its text comes from", () => {
        const { chip } = mountLegend(
            undefined,
            "--vscode-editorWidget-background: rgb(30, 30, 30); --vscode-editorWidget-foreground: rgb(204, 204, 204);",
        );

        expect(chip.backgroundColor).toBe("rgb(30, 30, 30)");
        expect(contrastRatio(chip.color, chip.backgroundColor)).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL_TEXT_CONTRAST,
        );
    });

    it("stays white in VS Code's light theme", () => {
        document.body.classList.add("vscode-light");
        const { chip } = mountLegend(
            undefined,
            "--vscode-editorWidget-background: rgb(243, 243, 243);",
        );

        expect(chip.backgroundColor).toBe("rgb(255, 255, 255)");
    });

    it("turns dark under the instance's dark theme", () => {
        const { chip } = mountLegend("dark");

        expect(chip.backgroundColor).toBe("rgb(37, 37, 38)");
    });

    it("drops the fills and the shadow in VS Code's high contrast", () => {
        document.body.classList.add("vscode-high-contrast");
        const { chip, next } = mountLegend("dark");

        expect(chip.boxShadow).toBe("none");
        expect(next.backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(next.color).toBe(chip.color);
    });

    it("keeps the keyboard focus ring on a button the pointer rests on", async () => {
        const { next, nextButton } = mountLegend();

        await focusByKeyboard(nextButton);
        await userEvent.hover(nextButton);

        expect(next.outlineStyle).toBe("solid");
        expect(next.outlineOffset).toBe("2px");
    });

    it("shows no hover outline outside high contrast", async () => {
        const { prev, prevButton } = mountLegend();

        await userEvent.hover(prevButton);

        expect(prev.outlineStyle).toBe("none");
    });

    it.each(["prev", "next"] as const)(
        "outlines the hovered %s button, dashed and unfilled, in VS Code's high contrast",
        async (which) => {
            document.body.classList.add("vscode-high-contrast");
            const legend = mountLegend("dark");
            const button = which === "prev" ? legend.prevButton : legend.nextButton;
            const style = which === "prev" ? legend.prev : legend.next;

            await userEvent.hover(button);

            expect(style.outlineStyle).toBe("dashed");
            expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
        },
    );

    it("keeps the focus ring over the hover outline in VS Code's high contrast", async () => {
        document.body.classList.add("vscode-high-contrast");
        const { next, nextButton } = mountLegend("dark");

        await focusByKeyboard(nextButton);
        await userEvent.hover(nextButton);

        expect(next.outlineStyle).toBe("solid");
    });
});
