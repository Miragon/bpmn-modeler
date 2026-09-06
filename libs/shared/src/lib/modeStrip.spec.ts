// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PropertiesPanelHandle } from "./propertiesPanelResizer";
import { mountModeStrip, type ModeStripOptions } from "./modeStrip";

function createPanelHandle(): PropertiesPanelHandle {
    return {
        isVisible: () => true,
        setVisible: vi.fn(),
        onVisibilityChanged: () => undefined,
    };
}

interface Harness {
    host: HTMLElement;
    stripEl: HTMLElement;
    resizerEl: HTMLElement;
    panelHandle: PropertiesPanelHandle;
    buttons: () => HTMLButtonElement[];
    badge: () => HTMLButtonElement | null;
}

function mount(overrides: Partial<ModeStripOptions> = {}): {
    strip: ReturnType<typeof mountModeStrip>;
    h: Harness;
    onSelect: ReturnType<typeof vi.fn>;
    onEscape: ReturnType<typeof vi.fn>;
} {
    const host = document.createElement("div");
    const stripEl = document.createElement("div");
    const resizerEl = document.createElement("div");
    host.appendChild(stripEl);
    document.body.append(host, resizerEl);
    const panelHandle = createPanelHandle();
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    const strip = mountModeStrip({
        host,
        stripEl,
        resizerEl,
        panelHandle,
        translate: (template) => template,
        onSelect,
        onEscape,
        ...overrides,
    });

    const h: Harness = {
        host,
        stripEl,
        resizerEl,
        panelHandle,
        buttons: () => Array.from(stripEl.querySelectorAll<HTMLButtonElement>(".mode-button")),
        badge: () => resizerEl.querySelector<HTMLButtonElement>(".mode-badge"),
    };
    return { strip, h, onSelect, onEscape };
}

describe("mountModeStrip", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    it("renders one button per mode with translated labels", () => {
        const { strip, h } = mount();
        strip.render({ mode: "implement", engine: "c7", busy: false });
        expect(h.buttons().map((b) => b.textContent)).toEqual(["View", "Design", "Implement"]);
    });

    it("marks the active mode as pressed and reflects it onto the host", () => {
        const { strip, h } = mount();
        strip.render({ mode: "design", engine: "c7", busy: false });
        const pressed = h.buttons().filter((b) => b.getAttribute("aria-pressed") === "true");
        expect(pressed.map((b) => b.textContent)).toEqual(["Design"]);
        expect(h.host.getAttribute("data-surface-mode")).toBe("design");
        expect(h.host.getAttribute("aria-busy")).toBe("false");
    });

    it("disables Implement with a tooltip on an untagged model", () => {
        const { strip, h } = mount();
        strip.render({ mode: "design", engine: undefined, busy: false });
        const implement = h.buttons()[2];
        expect(implement.getAttribute("aria-disabled")).toBe("true");
        expect(implement.title).not.toBe("");
        // aria-disabled, not the real attribute, so the tooltip survives.
        expect(implement.hasAttribute("disabled")).toBe(false);
    });

    it("ignores clicks on an unavailable mode and forwards available ones", () => {
        const { strip, h, onSelect } = mount();
        strip.render({ mode: "design", engine: undefined, busy: false });
        h.buttons()[2].click(); // Implement — unavailable
        expect(onSelect).not.toHaveBeenCalled();
        h.buttons()[0].click(); // View
        expect(onSelect).toHaveBeenCalledWith("view");
    });

    it("shows the collapsed-rail badge letter and reveals the panel on click", () => {
        const { strip, h } = mount();
        strip.render({ mode: "view", engine: "c7", busy: false });
        const badge = h.badge();
        expect(badge?.textContent).toBe("V");
        badge?.click();
        expect(h.panelHandle.setVisible).toHaveBeenCalledWith(true);
    });

    it("skips the badge when no resizer element is supplied", () => {
        const host = document.createElement("div");
        const stripEl = document.createElement("div");
        host.appendChild(stripEl);
        const strip = mountModeStrip({
            host,
            stripEl,
            panelHandle: createPanelHandle(),
            translate: (t) => t,
            onSelect: vi.fn(),
            onEscape: vi.fn(),
        });
        expect(() => strip.render({ mode: "design", engine: undefined, busy: true })).not.toThrow();
    });

    it("reflects busy state onto the host", () => {
        const { strip, h } = mount();
        strip.render({ mode: "view", engine: "c7", busy: true });
        expect(h.host.getAttribute("aria-busy")).toBe("true");
    });

    it("re-applies labels through onLabelChange", () => {
        let apply: (() => void) | undefined;
        const translate = vi.fn((template: string) => (template === "View" ? "Ansicht" : template));
        const { strip, h } = mount({
            translate,
            onLabelChange: (cb) => {
                apply = cb;
            },
        });
        strip.render({ mode: "view", engine: "c7", busy: false });
        expect(h.buttons()[0].textContent).toBe("Ansicht");
        apply?.();
        expect(h.buttons()[0].textContent).toBe("Ansicht");
    });

    it("fires onEscape on Escape in the strip", () => {
        const { strip, h, onEscape } = mount();
        strip.render({ mode: "view", engine: "c7", busy: false });
        h.stripEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(onEscape).toHaveBeenCalled();
    });
});
