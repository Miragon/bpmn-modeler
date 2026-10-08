import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountModeStrip, type ModeStripOptions } from "./modeStrip";

interface Harness {
    host: HTMLElement;
    stripEl: HTMLElement;
    chip: () => HTMLButtonElement | null;
    menu: () => HTMLElement | null;
    items: () => HTMLButtonElement[];
    labels: () => (string | null | undefined)[];
}

function mount(overrides: Partial<ModeStripOptions> = {}): {
    strip: ReturnType<typeof mountModeStrip>;
    h: Harness;
    onSelect: ReturnType<typeof vi.fn>;
    onEscape: ReturnType<typeof vi.fn>;
} {
    const canvas = document.createElement("div");
    const host = document.createElement("div");
    const stripEl = document.createElement("div");
    canvas.appendChild(stripEl);
    document.body.append(canvas, host);
    const onSelect = vi.fn();
    const onEscape = vi.fn();

    const strip = mountModeStrip({
        host,
        stripEl,
        translate: (template) => template,
        onSelect,
        onEscape,
        ...overrides,
    });

    const h: Harness = {
        host,
        stripEl,
        chip: () => stripEl.querySelector<HTMLButtonElement>(".mode-chip"),
        menu: () => document.querySelector<HTMLElement>(".mode-menu"),
        items: () => Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-menu-item")),
        labels: () =>
            Array.from(document.querySelectorAll(".mode-menu-item-label")).map(
                (l) => l.textContent,
            ),
    };
    return { strip, h, onSelect, onEscape };
}

describe("mountModeStrip", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    const press = (target: Element, key: string) =>
        target.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );

    it("shows the current mode on the chip and keeps the menu closed", () => {
        const { strip, h } = mount();
        strip.render({ mode: "implement", engine: "c7", busy: false });
        expect(h.chip()?.textContent).toBe("Implement");
        expect(h.chip()?.getAttribute("aria-expanded")).toBe("false");
        expect(h.menu()?.hidden).toBe(true);
    });

    it("lists one described entry per mode", () => {
        const { strip, h } = mount();
        strip.render({ mode: "implement", engine: "c7", busy: false });
        expect(h.labels()).toEqual(["View", "Design", "Implement"]);
        expect(h.items()[0].querySelector(".mode-menu-item-description")?.textContent).toBe(
            "Read-only",
        );
    });

    it("opens the menu from the chip and focuses the current mode", () => {
        const { strip, h } = mount();
        strip.render({ mode: "design", engine: "c7", busy: false });
        h.chip()!.click();
        expect(h.menu()?.hidden).toBe(false);
        expect(h.chip()?.getAttribute("aria-expanded")).toBe("true");
        expect(document.activeElement).toBe(h.items()[1]);
    });

    it("closes the menu on a second chip click", () => {
        const { strip, h } = mount();
        strip.render({ mode: "design", engine: "c7", busy: false });
        h.chip()!.click();
        h.chip()!.click();
        expect(h.menu()?.hidden).toBe(true);
    });

    it("checks the active mode and reflects it onto the host", () => {
        const { strip, h } = mount();
        strip.render({ mode: "design", engine: "c7", busy: false });
        const checked = h.items().filter((i) => i.getAttribute("aria-checked") === "true");
        expect(checked.map((i) => i.dataset.mode)).toEqual(["design"]);
        expect(h.host.getAttribute("data-surface-mode")).toBe("design");
        expect(h.host.getAttribute("aria-busy")).toBe("false");
    });

    it("disables Implement with a tooltip on an untagged model", () => {
        const { strip, h } = mount();
        strip.render({ mode: "design", engine: undefined, busy: false });
        const implement = h.items()[2];
        expect(implement.getAttribute("aria-disabled")).toBe("true");
        expect(implement.title).not.toBe("");
        // aria-disabled, not the real attribute, so the tooltip survives.
        expect(implement.hasAttribute("disabled")).toBe(false);
    });

    it("ignores clicks on an unavailable mode and keeps the menu open", () => {
        const { strip, h, onSelect } = mount();
        strip.render({ mode: "design", engine: undefined, busy: false });
        h.chip()!.click();
        h.items()[2].click();
        expect(onSelect).not.toHaveBeenCalled();
        expect(h.menu()?.hidden).toBe(false);
    });

    it("forwards an available mode, closes the menu and returns focus to the chip", () => {
        const { strip, h, onSelect } = mount();
        strip.render({ mode: "design", engine: undefined, busy: false });
        h.chip()!.click();
        h.items()[0].click();
        expect(onSelect).toHaveBeenCalledWith("view");
        expect(h.menu()?.hidden).toBe(true);
        expect(document.activeElement).toBe(h.chip());
    });

    it("moves focus through the entries with the arrow, Home and End keys", () => {
        const { strip, h } = mount();
        strip.render({ mode: "view", engine: "c7", busy: false });
        h.chip()!.click();
        press(h.items()[0], "ArrowDown");
        expect(document.activeElement).toBe(h.items()[1]);
        press(h.items()[1], "End");
        expect(document.activeElement).toBe(h.items()[2]);
        press(h.items()[2], "ArrowDown");
        expect(document.activeElement).toBe(h.items()[0]);
        press(h.items()[0], "ArrowUp");
        expect(document.activeElement).toBe(h.items()[2]);
        press(h.items()[2], "Home");
        expect(document.activeElement).toBe(h.items()[0]);
    });

    it("opens the menu with ArrowDown on the chip", () => {
        const { strip, h } = mount();
        strip.render({ mode: "view", engine: "c7", busy: false });
        press(h.chip()!, "ArrowDown");
        expect(h.menu()?.hidden).toBe(false);
    });

    it("closes the menu on Escape without firing onEscape", () => {
        const { strip, h, onEscape } = mount();
        strip.render({ mode: "view", engine: "c7", busy: false });
        h.chip()!.click();
        press(h.items()[0], "Escape");
        expect(h.menu()?.hidden).toBe(true);
        expect(document.activeElement).toBe(h.chip());
        expect(onEscape).not.toHaveBeenCalled();
    });

    it("closes the menu on a press outside of it", () => {
        const { strip, h } = mount();
        strip.render({ mode: "view", engine: "c7", busy: false });
        h.chip()!.click();
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(h.menu()?.hidden).toBe(true);
    });

    it("sits right of the token-simulation toggle while the surface has one", () => {
        const { strip, h } = mount();
        strip.render({ mode: "view", engine: "c7", busy: true });
        expect(h.stripEl.style.left).toBe("");

        const toggle = document.createElement("div");
        toggle.className = "bts-toggle-mode";
        Object.defineProperties(toggle, {
            offsetLeft: { value: 20 },
            offsetWidth: { value: 156 },
        });
        h.stripEl.parentElement!.appendChild(toggle);
        strip.render({ mode: "view", engine: "c7", busy: false });
        expect(h.stripEl.style.left).toBe("184px");

        toggle.remove();
        strip.render({ mode: "view", engine: "c7", busy: false });
        expect(h.stripEl.style.left).toBe("");
    });

    it("renders no badge on a supplied resizer element", () => {
        const resizerEl = document.createElement("div");
        const { strip } = mount({ resizerEl });
        strip.render({ mode: "view", engine: "c7", busy: false });
        expect(resizerEl.children.length).toBe(0);
    });

    it("renders no chip or menu for fewer than two modes, still stamping the host", () => {
        const { strip, h } = mount({ modes: ["view"] });
        strip.render({ mode: "view", engine: undefined, busy: false });
        expect(h.chip()).toBeNull();
        expect(h.menu()).toBeNull();
        expect(h.host.getAttribute("data-surface-mode")).toBe("view");
    });

    it("renders only the requested subset of modes", () => {
        const { strip, h } = mount({ modes: ["view", "design"] });
        strip.render({ mode: "view", engine: undefined, busy: false });
        expect(h.labels()).toEqual(["View", "Design"]);
    });

    it("reflects busy state onto the host", () => {
        const { strip, h } = mount();
        strip.render({ mode: "view", engine: "c7", busy: true });
        expect(h.host.getAttribute("aria-busy")).toBe("true");
    });

    it("re-applies labels through onLabelChange", () => {
        let apply: (() => void) | undefined;
        let language = "en";
        const translate = (template: string) =>
            language === "de" && template === "View" ? "Ansicht" : template;
        const { strip, h } = mount({
            translate,
            onLabelChange: (cb) => {
                apply = cb;
            },
        });
        strip.render({ mode: "view", engine: "c7", busy: false });
        expect(h.chip()?.textContent).toBe("View");
        language = "de";
        apply?.();
        expect(h.chip()?.textContent).toBe("Ansicht");
        expect(h.labels()[0]).toBe("Ansicht");
    });

    it("fires onEscape on Escape on the closed chip", () => {
        const { strip, h, onEscape } = mount();
        strip.render({ mode: "view", engine: "c7", busy: false });
        press(h.chip()!, "Escape");
        expect(onEscape).toHaveBeenCalled();
    });

    it("removes its chip and menu on destroy", () => {
        const { strip, h } = mount();
        strip.render({ mode: "view", engine: "c7", busy: false });
        h.chip()!.click();
        strip.destroy();
        expect(h.chip()).toBeNull();
        expect(h.menu()).toBeNull();
    });
});
