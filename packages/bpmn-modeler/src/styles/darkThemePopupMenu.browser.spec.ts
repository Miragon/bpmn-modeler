import "diagram-js/assets/diagram-js.css";
import "./dark-theme/diagram-js.css";

import { afterEach, describe, expect, it } from "vitest";

const WCAG_AA_NORMAL_TEXT_CONTRAST = 4.5;
const WCAG_NON_TEXT_CONTRAST = 3;

const mountedRoots: HTMLElement[] = [];

afterEach(() => {
    mountedRoots.forEach((root) => root.remove());
    mountedRoots.length = 0;
});

function mountDarkPopup(popupMarkup: string, hostColorScheme = "normal"): HTMLElement {
    const themeRoot = document.createElement("div");
    themeRoot.setAttribute("data-bpmn-theme", "dark");
    themeRoot.style.colorScheme = hostColorScheme;
    themeRoot.innerHTML = `
        <div class="djs-container djs-parent bio-theme-parent">
            <div class="djs-popup">${popupMarkup}</div>
        </div>`;
    document.body.append(themeRoot);
    mountedRoots.push(themeRoot);
    return themeRoot;
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
        const popup = mountDarkPopup(`
            <div class="djs-popup-body">
                <div class="entry selected">
                    <div class="djs-popup-entry-content">
                        <span class="djs-popup-label">User task</span>
                        <span class="djs-popup-entry-description">Assigned to a person</span>
                    </div>
                </div>
            </div>`);
        const selectedBackground = getComputedStyle(
            popup.querySelector(".entry.selected")!,
        ).backgroundColor;

        for (const text of popup.querySelectorAll(
            ".djs-popup-label, .djs-popup-entry-description",
        )) {
            expect(
                contrastRatio(getComputedStyle(text).color, selectedBackground),
            ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_CONTRAST);
        }
    });

    // The input and icon must not depend on the browser's field colours, which follow the host's color-scheme.
    it.each(["normal", "dark"])(
        "keeps the search field readable under a %s host color-scheme",
        (hostColorScheme) => {
            const popup = mountDarkPopup(
                `<div class="djs-popup-search">
                <svg class="djs-popup-search-icon" viewBox="0 0 14 14"><path d="M0 0H14V14H0Z" fill="#22242A"/></svg>
                <input type="text" value="task" />
            </div>`,
                hostColorScheme,
            );
            const searchInput = popup.querySelector("input")!;
            const searchIcon = popup.querySelector(".djs-popup-search-icon path")!;

            for (const focused of [false, true]) {
                if (focused) {
                    searchInput.focus();
                }
                const fieldBackground = getComputedStyle(searchInput).backgroundColor;

                expect(
                    contrastRatio(getComputedStyle(searchInput).color, fieldBackground),
                ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT_CONTRAST);
                expect(
                    contrastRatio(getComputedStyle(searchIcon).fill, fieldBackground),
                ).toBeGreaterThanOrEqual(WCAG_NON_TEXT_CONTRAST);
            }
        },
    );
});
