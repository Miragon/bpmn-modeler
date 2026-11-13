// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    INITIALLY_COLLAPSED_PANEL_ATTRIBUTE,
    mountEditorCanvas,
    mountPanelChrome,
    type PanelChrome,
    type PanelChromeOptions,
} from "./panelChrome";
import type { PanelStateStore, PropertiesPanelUiState } from "./propertiesPanelUiState";

const GERMAN: Record<string, string> = {
    "Open properties panel": "Eigenschaftenbereich öffnen",
    "Close properties panel": "Eigenschaftenbereich schließen",
};

function memoryStore(initial?: PropertiesPanelUiState): PanelStateStore & {
    saved(): PropertiesPanelUiState | undefined;
} {
    let state = initial;
    return {
        read: () => state,
        merge: (partial) => {
            state = { ...state, ...partial };
        },
        saved: () => state,
    };
}

const mounted: PanelChrome[] = [];

function emptyRoot(): HTMLElement {
    const root = document.createElement("div");
    document.body.append(root);
    return root;
}

function mount(
    overrides: Partial<PanelChromeOptions> = {},
    root: HTMLElement = emptyRoot(),
): { chrome: PanelChrome; root: HTMLElement; options: PanelChromeOptions } {
    const options: PanelChromeOptions = {
        store: memoryStore(),
        translate: (key) => GERMAN[key] ?? key,
        onLanguageChange: () => () => undefined,
        focusCanvas: vi.fn(),
        isCanvasFocused: () => false,
        ...overrides,
    };
    const chrome = mountPanelChrome(root, options);
    mounted.push(chrome);
    return { chrome, root, options };
}

function press(key: string, shiftKey = false): void {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
}

const toggleButton = (root: HTMLElement) =>
    root.querySelector<HTMLButtonElement>(".panel-resizer-toggle")!;

afterEach(() => {
    for (const chrome of mounted.splice(0)) {
        chrome.dispose();
    }
    document.body.replaceChildren();
});

describe("mountPanelChrome", () => {
    it("builds the canvas, the resizer and the panel with its mount into an empty root", () => {
        const { chrome, root } = mount();

        expect(root.querySelector(".content.with-diagram > .canvas")).toBe(chrome.canvas);
        expect(root.querySelector(".content > .panel-resizer")).toBe(chrome.resizer);
        expect(root.querySelector(".content > .properties-panel-parent")).toBe(chrome.panelHost);
        expect(chrome.panelHost.querySelector(".panel-mount")).toBe(chrome.panelMount);
        expect(chrome.dropZone.contains(chrome.canvas)).toBe(true);
    });

    it("labels the toggle in the page's language with its shortcut", () => {
        const { root } = mount();

        expect(toggleButton(root).getAttribute("aria-label")).toBe(
            "Eigenschaftenbereich schließen (Shift+P)",
        );

        toggleButton(root).click();

        expect(toggleButton(root).title).toBe("Eigenschaftenbereich öffnen (Shift+P)");
    });

    it("relabels the toggle when the language changes", () => {
        let relabel = (): void => undefined;
        let language: Record<string, string> = {};
        const { root } = mount({
            translate: (key) => language[key] ?? key,
            onLanguageChange: (apply) => {
                relabel = apply;
                return () => undefined;
            },
        });

        language = GERMAN;
        relabel();

        expect(toggleButton(root).title).toBe("Eigenschaftenbereich schließen (Shift+P)");
    });

    it("toggles the panel with Shift+P and remembers the user's choice", () => {
        const store = memoryStore();
        const onVisibilityChosen = vi.fn();
        const { chrome } = mount({ store, onVisibilityChosen });

        press("P", true);

        expect(chrome.panel.isVisible()).toBe(false);
        expect(store.saved()?.panelVisible).toBe(false);
        expect(onVisibilityChosen).toHaveBeenCalledWith(false);

        press("P", true);

        expect(chrome.panel.isVisible()).toBe(true);
    });

    it("leaves Shift+P to the view while the gate is closed", () => {
        const { chrome } = mount({ isEnabled: () => false });

        press("P", true);

        expect(chrome.panel.isVisible()).toBe(true);
    });

    it("moves focus to the canvas on Escape only when asked to", () => {
        const focusCanvas = vi.fn();
        mount({ focusCanvas, escapeToCanvas: true });

        press("Escape");

        expect(focusCanvas).toHaveBeenCalledOnce();
    });

    it("opens at the saved width and visibility", () => {
        const { chrome } = mount({ store: memoryStore({ panelWidth: 420, panelVisible: false }) });

        expect(chrome.panel.isVisible()).toBe(false);

        chrome.panel.setVisible(true);

        expect(chrome.panelHost.style.width).toBe("420px");
    });

    it("starts collapsed when the shell marks the root, so the panel cannot flash open", () => {
        const root = emptyRoot();
        root.setAttribute(INITIALLY_COLLAPSED_PANEL_ATTRIBUTE, "");

        const { chrome } = mount({}, root);

        expect(chrome.panel.isVisible()).toBe(false);
        expect(chrome.panelHost.classList).toContain("collapsed");
        expect(chrome.resizer.classList).toContain("collapsed");
        expect(chrome.visibility.isDecided()).toBe(false);
    });

    it("hides and shows the panel with its resizer", () => {
        const { chrome } = mount();

        chrome.hidePanel(true);

        expect(chrome.panelHost.hidden).toBe(true);
        expect(chrome.resizer.hidden).toBe(true);
    });

    it("stops answering Shift+P and removes the toggle once disposed", () => {
        const { chrome, root } = mount();
        mounted.splice(0);

        chrome.dispose();
        press("P", true);

        expect(chrome.panel.isVisible()).toBe(true);
        expect(root.querySelector(".panel-resizer-toggle")).toBeNull();
    });
});

describe("mountEditorCanvas", () => {
    it("builds the canvas alone for a page without a properties panel", () => {
        const root = emptyRoot();

        const { dropZone, canvas } = mountEditorCanvas(root);

        expect(root.firstElementChild).toBe(dropZone);
        expect(dropZone.children).toEqual(expect.objectContaining({ length: 1 }));
        expect(dropZone.firstElementChild).toBe(canvas);
        expect(root.querySelector(".panel-resizer")).toBeNull();
    });
});
