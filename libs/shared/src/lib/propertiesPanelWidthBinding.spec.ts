// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { initResizer, type PropertiesPanelHandle } from "./propertiesPanelResizer";
import type { PropertiesPanelUiState } from "./propertiesPanelUiState";
import { MAX_PANEL_WIDTH, MIN_PANEL_WIDTH } from "./propertiesPanelWidth";
import { bindPanelWidth } from "./propertiesPanelWidthBinding";

describe("bindPanelWidth", () => {
    const liveHandles: PropertiesPanelHandle[] = [];

    afterEach(() => {
        for (const handle of liveHandles.splice(0)) {
            handle.dispose();
        }
        document.body.replaceChildren();
    });

    function memoryStore(initial?: PropertiesPanelUiState) {
        let state = initial;
        return {
            read: () => state,
            merge: vi.fn((partial: Partial<PropertiesPanelUiState>) => {
                state = { ...state, ...partial };
            }),
        };
    }

    function bind(saved?: PropertiesPanelUiState) {
        document.body.innerHTML = `
            <div id="js-properties-panel" class="collapsed"></div>
            <div id="js-panel-resizer" class="collapsed"></div>
        `;
        const panel = document.getElementById("js-properties-panel")!;
        const resizer = document.getElementById("js-panel-resizer")!;
        const handle = initResizer({ getToggleLabel: (state) => state });
        liveHandles.push(handle);
        const store = memoryStore(saved);
        bindPanelWidth(handle, store);
        return { panel, resizer, handle, store };
    }

    function dragOpenBy(resizer: HTMLElement, distance: number): void {
        resizer.dispatchEvent(new MouseEvent("mousedown", { clientX: 1000, bubbles: true }));
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 1000 - distance }));
        document.dispatchEvent(new MouseEvent("mouseup"));
    }

    it("opens the panel at this editor's saved width without saving it again", () => {
        const { panel, handle, store } = bind({ panelWidth: 720 });

        handle.setVisible(true);

        expect(panel.style.width).toBe("720px");
        expect(store.merge).not.toHaveBeenCalled();
    });

    it("opens the panel at the clamped width when the saved one is out of range", () => {
        const { panel, handle } = bind({ panelWidth: MAX_PANEL_WIDTH * 2 });

        handle.setVisible(true);

        expect(panel.style.width).toBe(`${MAX_PANEL_WIDTH}px`);
    });

    it("keeps the default open width without a saved one", () => {
        const { panel, handle } = bind();

        handle.setVisible(true);

        expect(panel.style.width).toBe(`${MIN_PANEL_WIDTH * 2}px`);
    });

    it("saves the width a drag leaves the panel at", () => {
        const { resizer, store } = bind();

        dragOpenBy(resizer, 650);

        expect(store.merge).toHaveBeenCalledExactlyOnceWith({ panelWidth: 650 });
    });
});
