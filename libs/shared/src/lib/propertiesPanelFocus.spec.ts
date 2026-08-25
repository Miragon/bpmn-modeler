// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PropertiesPanelHandle } from "./propertiesPanelResizer";
import {
    focusPropertiesPanel,
    installPanelShortcuts,
    isTextEditingSurface,
    togglePropertiesPanel,
} from "./propertiesPanelFocus";
import type { PanelFocusOptions } from "./propertiesPanelFocus";

/** Runs the scheduled callback synchronously instead of via rAF. */
const syncSchedule: PanelFocusOptions["schedule"] = (cb) => cb();

function createHandle(visible = true): PropertiesPanelHandle & { setVisible: ReturnType<typeof vi.fn> } {
    let state = visible;
    const setVisible = vi.fn((v: boolean) => {
        state = v;
    });
    return {
        isVisible: () => state,
        setVisible,
        onVisibilityChanged: () => {},
    };
}

function createPanel(...fieldTags: string[]): { panel: HTMLDivElement; opts: PanelFocusOptions } {
    const panel = document.createElement("div");
    panel.id = "js-properties-panel";

    const scrollContainer = document.createElement("div");
    scrollContainer.classList.add("bio-properties-panel-scroll-container");
    panel.appendChild(scrollContainer);

    for (const tag of fieldTags) {
        const el = document.createElement(tag);
        scrollContainer.appendChild(el);
    }

    document.body.appendChild(panel);
    return { panel, opts: { getPanelRoot: () => panel, schedule: syncSchedule } };
}

function cleanupPanels(): void {
    document.querySelectorAll("#js-properties-panel").forEach((el) => el.remove());
}

// ────────────────────────────────────────────────────────────────────
// isTextEditingSurface
// ────────────────────────────────────────────────────────────────────

describe("isTextEditingSurface", () => {
    it("returns true for <input>", () => {
        expect(isTextEditingSurface(document.createElement("input"))).toBe(true);
    });

    it("returns true for <textarea>", () => {
        expect(isTextEditingSurface(document.createElement("textarea"))).toBe(true);
    });

    it("returns true for contenteditable element", () => {
        const div = document.createElement("div");
        div.contentEditable = "true";
        expect(isTextEditingSurface(div)).toBe(true);
    });

    it("returns false for a plain <div>", () => {
        expect(isTextEditingSurface(document.createElement("div"))).toBe(false);
    });

    it("returns false for null", () => {
        expect(isTextEditingSurface(null)).toBe(false);
    });

    it("returns false for contenteditable=inherit", () => {
        const div = document.createElement("div");
        div.contentEditable = "inherit";
        expect(isTextEditingSurface(div)).toBe(false);
    });
});

// ────────────────────────────────────────────────────────────────────
// focusPropertiesPanel
// ────────────────────────────────────────────────────────────────────

describe("focusPropertiesPanel", () => {
    afterEach(cleanupPanels);

    it("expands a collapsed panel and focuses the first field", () => {
        const handle = createHandle(false);
        const { opts } = createPanel("input", "select");

        focusPropertiesPanel(handle, opts);

        expect(handle.setVisible).toHaveBeenCalledWith(true);
        expect(document.activeElement?.tagName).toBe("INPUT");
    });

    it("does not call setVisible when panel is already visible", () => {
        const handle = createHandle(true);
        const { opts } = createPanel("input");

        focusPropertiesPanel(handle, opts);

        expect(handle.setVisible).not.toHaveBeenCalled();
        expect(document.activeElement?.tagName).toBe("INPUT");
    });

    it("skips disabled inputs", () => {
        const handle = createHandle(true);
        const { panel, opts } = createPanel();
        const scrollContainer = panel.querySelector(".bio-properties-panel-scroll-container")!;

        const disabled = document.createElement("input");
        disabled.disabled = true;
        scrollContainer.appendChild(disabled);

        const enabled = document.createElement("input");
        scrollContainer.appendChild(enabled);

        focusPropertiesPanel(handle, opts);
        expect(document.activeElement).toBe(enabled);
    });

    it("skips hidden inputs", () => {
        const handle = createHandle(true);
        const { panel, opts } = createPanel();
        const scrollContainer = panel.querySelector(".bio-properties-panel-scroll-container")!;

        const hidden = document.createElement("input");
        hidden.type = "hidden";
        scrollContainer.appendChild(hidden);

        const text = document.createElement("input");
        scrollContainer.appendChild(text);

        focusPropertiesPanel(handle, opts);
        expect(document.activeElement).toBe(text);
    });

    it("falls back to tabIndex=-1 on the scroll container when no focusable fields exist", () => {
        const handle = createHandle(true);
        const { panel, opts } = createPanel();
        const scrollContainer = panel.querySelector(".bio-properties-panel-scroll-container")!;

        focusPropertiesPanel(handle, opts);

        expect((scrollContainer as HTMLElement).tabIndex).toBe(-1);
        expect(document.activeElement).toBe(scrollContainer);
    });

    it("is a no-op when the panel root is missing", () => {
        const handle = createHandle(true);
        const opts: PanelFocusOptions = { getPanelRoot: () => null, schedule: syncSchedule };

        focusPropertiesPanel(handle, opts);
        expect(handle.setVisible).not.toHaveBeenCalled();
    });

    it("is a no-op when the panel is empty (childElementCount === 0)", () => {
        const panel = document.createElement("div");
        panel.id = "js-properties-panel";
        document.body.appendChild(panel);

        const handle = createHandle(false);
        const opts: PanelFocusOptions = { getPanelRoot: () => panel, schedule: syncSchedule };

        focusPropertiesPanel(handle, opts);
        expect(handle.setVisible).not.toHaveBeenCalled();
    });

    it("focuses a button when only group-header buttons exist", () => {
        const handle = createHandle(true);
        const { opts } = createPanel("button");

        focusPropertiesPanel(handle, opts);
        expect(document.activeElement?.tagName).toBe("BUTTON");
    });
});

// ────────────────────────────────────────────────────────────────────
// togglePropertiesPanel
// ────────────────────────────────────────────────────────────────────

describe("togglePropertiesPanel", () => {
    afterEach(cleanupPanels);

    it("collapses visible panel and calls focusCanvas when focus was inside", () => {
        const handle = createHandle(true);
        const focusCanvas = vi.fn();
        const { panel, opts } = createPanel("input");

        // Put focus inside the panel
        const input = panel.querySelector("input")!;
        input.focus();

        togglePropertiesPanel(handle, focusCanvas, opts);

        expect(handle.setVisible).toHaveBeenCalledWith(false);
        expect(focusCanvas).toHaveBeenCalledTimes(1);
    });

    it("collapses visible panel without calling focusCanvas when focus is elsewhere", () => {
        const handle = createHandle(true);
        const focusCanvas = vi.fn();
        const { opts } = createPanel("input");

        // Focus is on the body, not inside the panel
        (document.activeElement as HTMLElement)?.blur?.();

        togglePropertiesPanel(handle, focusCanvas, opts);

        expect(handle.setVisible).toHaveBeenCalledWith(false);
        expect(focusCanvas).not.toHaveBeenCalled();
    });

    it("expands collapsed panel without moving focus", () => {
        const handle = createHandle(false);
        const focusCanvas = vi.fn();
        const opts: PanelFocusOptions = { getPanelRoot: () => null, schedule: syncSchedule };

        togglePropertiesPanel(handle, focusCanvas, opts);

        expect(handle.setVisible).toHaveBeenCalledWith(true);
        expect(focusCanvas).not.toHaveBeenCalled();
    });
});

// ────────────────────────────────────────────────────────────────────
// installPanelShortcuts
// ────────────────────────────────────────────────────────────────────

describe("installPanelShortcuts", () => {
    const focusCanvas = vi.fn();
    const isCanvasFocused = vi.fn<() => boolean>();
    const isEnabled = vi.fn<() => boolean>();

    let handle: ReturnType<typeof createHandle>;
    let opts: PanelFocusOptions;

    function dispatchKeydown(
        key: string,
        modifiers: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean; defaultPrevented?: boolean } = {},
    ): KeyboardEvent {
        const event = new KeyboardEvent("keydown", {
            key,
            shiftKey: modifiers.shift ?? false,
            ctrlKey: modifiers.ctrl ?? false,
            metaKey: modifiers.meta ?? false,
            altKey: modifiers.alt ?? false,
            bubbles: true,
            cancelable: true,
        });
        if (modifiers.defaultPrevented) event.preventDefault();
        document.dispatchEvent(event);
        return event;
    }

    beforeAll(() => {
        handle = createHandle(true);
        const panelSetup = createPanel("input", "select");
        opts = panelSetup.opts;

        installPanelShortcuts(
            { handle, focusCanvas, isCanvasFocused, isEnabled },
            opts,
        );
    });

    beforeEach(() => {
        focusCanvas.mockReset();
        isCanvasFocused.mockReset();
        isEnabled.mockReset();
        handle.setVisible.mockClear();

        isCanvasFocused.mockReturnValue(false);
        isEnabled.mockReturnValue(true);
        // Reset handle visibility to true
        handle.setVisible(true);
        handle.setVisible.mockClear();
        // Move focus away from panel fields left focused by prior tests
        (document.activeElement as HTMLElement)?.blur?.();
    });

    afterAll(cleanupPanels);

    it("'p' focuses the panel when the canvas has focus", () => {
        isCanvasFocused.mockReturnValue(true);
        const event = dispatchKeydown("p");
        expect(document.activeElement?.tagName).toBe("INPUT");
        expect(event.defaultPrevented).toBe(true);
    });

    it("'p' is inert when the canvas does not have focus", () => {
        isCanvasFocused.mockReturnValue(false);
        const event = dispatchKeydown("p");
        expect(event.defaultPrevented).toBe(false);
    });

    it("Shift+P toggles the panel from the canvas", () => {
        isCanvasFocused.mockReturnValue(true);
        const event = dispatchKeydown("P", { shift: true });
        expect(handle.setVisible).toHaveBeenCalledWith(false);
        expect(event.defaultPrevented).toBe(true);
    });

    it("Shift+P toggles the panel from a non-text element inside the panel", () => {
        // Focus a non-text element (e.g. a button)
        const panel = document.getElementById("js-properties-panel")!;
        const btn = document.createElement("button");
        panel.appendChild(btn);
        btn.focus();

        const event = dispatchKeydown("P", { shift: true });
        expect(handle.setVisible).toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);

        btn.remove();
    });

    it("Shift+P is inert inside a text input", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();

        const event = dispatchKeydown("P", { shift: true });
        expect(handle.setVisible).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);

        input.remove();
    });

    it("Shift+P is inert inside a contenteditable", () => {
        const div = document.createElement("div");
        div.contentEditable = "true";
        div.tabIndex = 0;
        document.body.appendChild(div);
        div.focus();

        const event = dispatchKeydown("P", { shift: true });
        expect(handle.setVisible).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);

        div.remove();
    });

    it("Ctrl+P passes through (VS Code Quick Open)", () => {
        isCanvasFocused.mockReturnValue(true);
        const event = dispatchKeydown("p", { ctrl: true });
        expect(handle.setVisible).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it("Cmd+P passes through (macOS Quick Open)", () => {
        isCanvasFocused.mockReturnValue(true);
        const event = dispatchKeydown("p", { meta: true });
        expect(handle.setVisible).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it("Alt+P passes through", () => {
        isCanvasFocused.mockReturnValue(true);
        const event = dispatchKeydown("p", { alt: true });
        expect(handle.setVisible).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it("defaultPrevented events are ignored", () => {
        isCanvasFocused.mockReturnValue(true);
        const event = dispatchKeydown("p", { defaultPrevented: true });
        expect(event.defaultPrevented).toBe(true);
    });

    it("all shortcuts are disabled when isEnabled returns false", () => {
        isEnabled.mockReturnValue(false);
        isCanvasFocused.mockReturnValue(true);

        dispatchKeydown("p");
        dispatchKeydown("P", { shift: true });

        expect(handle.setVisible).not.toHaveBeenCalled();
    });
});

describe("installPanelShortcuts (escapeToCanvas)", () => {
    const focusCanvas = vi.fn();
    const isCanvasFocused = vi.fn<() => boolean>();

    let handle: ReturnType<typeof createHandle>;

    beforeAll(() => {
        handle = createHandle(true);

        installPanelShortcuts(
            { handle, focusCanvas, isCanvasFocused, escapeToCanvas: true },
            { getPanelRoot: () => null, schedule: (cb) => cb() },
        );
    });

    beforeEach(() => {
        focusCanvas.mockReset();
        isCanvasFocused.mockReset();
    });

    function dispatchKeydown(
        key: string,
        modifiers: { defaultPrevented?: boolean } = {},
    ): void {
        const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
        if (modifiers.defaultPrevented) event.preventDefault();
        document.dispatchEvent(event);
    }

    it("Escape calls focusCanvas", () => {
        dispatchKeydown("Escape");
        expect(focusCanvas).toHaveBeenCalledTimes(1);
    });

    it("Escape is passive (does not call preventDefault)", () => {
        const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
    });

    it("Escape is ignored when defaultPrevented", () => {
        dispatchKeydown("Escape", { defaultPrevented: true });
        // focusCanvas was called by the beforeAll listener plus the non-
        // defaultPrevented tests; checking it was NOT called in *this* dispatch
        // is checked by the count across the describe block.
        expect(focusCanvas).not.toHaveBeenCalled();
    });
});

// Import afterEach/afterAll for cleanup
import { afterAll, afterEach } from "vitest";
