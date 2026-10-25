import "diagram-js/assets/diagram-js.css";
import "./dark-theme/diagram-js.css";

import { afterEach, describe, expect, it } from "vitest";

const WCAG_AA_NORMAL_TEXT_CONTRAST = 4.5;

const mountedRoots: HTMLElement[] = [];

afterEach(() => {
    mountedRoots.forEach((root) => root.remove());
    mountedRoots.length = 0;
});

function mountDarkPopupWithSelectedEntry(): {
    label: HTMLElement;
    description: HTMLElement;
    entry: HTMLElement;
} {
    const themeRoot = document.createElement("div");
    themeRoot.setAttribute("data-bpmn-theme", "dark");
    themeRoot.innerHTML = `
        <div class="djs-container djs-parent bio-theme-parent">
            <div class="djs-popup">
                <div class="djs-popup-body">
                    <div class="entry selected">
                        <div class="djs-popup-entry-content">
                            <span class="djs-popup-label">User task</span>
                            <span class="djs-popup-entry-description">Assigned to a person</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.append(themeRoot);
    mountedRoots.push(themeRoot);
    return {
        entry: themeRoot.querySelector<HTMLElement>(".entry.selected")!,
        label: themeRoot.querySelector<HTMLElement>(".djs-popup-label")!,
        description: themeRoot.querySelector<HTMLElement>(".djs-popup-entry-description")!,
    };
}

// Painting through a canvas normalises `color(srgb …)` from `color-mix()` as well as `rgb()`.
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

describe("dark theme popup menu", () => {
    it("keeps the selected entry's label and description readable", () => {
        const { entry, label, description } = mountDarkPopupWithSelectedEntry();
        const selectedBackground = getComputedStyle(entry).backgroundColor;

        expect(
            contrastRatio(getComputedStyle(label).color, selectedBackground),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_CONTRAST);
        expect(
            contrastRatio(getComputedStyle(description).color, selectedBackground),
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_CONTRAST);
    });
});
