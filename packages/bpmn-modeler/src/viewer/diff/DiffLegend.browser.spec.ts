import "../../styles/diffView.css";

import { afterEach, describe, expect, it } from "vitest";

import { DiffLegend } from "./DiffLegend";

const MIRAGON_BLUE = "rgb(51, 93, 229)";
const WCAG_AA_NORMAL_TEXT_CONTRAST = 4.5;

const mountedRoots: HTMLElement[] = [];

afterEach(() => {
    mountedRoots.forEach((root) => root.remove());
    mountedRoots.length = 0;
    document.body.classList.remove("vscode-high-contrast");
});

function mountLegend(theme?: "light" | "dark") {
    const themeRoot = document.createElement("div");
    if (theme) themeRoot.setAttribute("data-bpmn-theme", theme);
    document.body.append(themeRoot);
    mountedRoots.push(themeRoot);
    new DiffLegend(themeRoot, { onPrevious: () => undefined, onNext: () => undefined }).update({
        counts: { added: 1, removed: 0, changed: 2, layoutChanged: 0 },
    });
    const chip = themeRoot.querySelector<HTMLElement>(".diff-legend")!;
    return {
        chip: getComputedStyle(chip),
        prev: getComputedStyle(chip.querySelector(".diff-legend__prev-btn")!),
        next: getComputedStyle(chip.querySelector(".diff-legend__next-btn")!),
    };
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
    it("is the Miragon look: Geist, a blue Next button, 12px chip and 8px button radii", () => {
        const { chip, prev, next } = mountLegend();

        expect(chip.fontFamily).toMatch(/^"Geist Variable", Geist, /);
        expect(chip.borderRadius).toBe("12px");
        expect(chip.backgroundColor).toBe("rgb(255, 255, 255)");
        expect(next.backgroundColor).toBe(MIRAGON_BLUE);
        expect(next.color).toBe("rgb(255, 255, 255)");
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
        expect(contrastRatio(next.color, next.backgroundColor)).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL_TEXT_CONTRAST,
        );
    });

    it("turns dark under the instance's dark theme and keeps the blue Next button", () => {
        const { chip, next } = mountLegend("dark");

        expect(chip.backgroundColor).toBe("rgb(37, 37, 38)");
        expect(next.backgroundColor).toBe(MIRAGON_BLUE);
    });

    it("drops the fills and the shadow in VS Code's high contrast", () => {
        document.body.classList.add("vscode-high-contrast");
        const { chip, next } = mountLegend("dark");

        expect(chip.boxShadow).toBe("none");
        expect(next.backgroundColor).toBe("rgba(0, 0, 0, 0)");
        expect(next.color).toBe(chip.color);
    });
});
