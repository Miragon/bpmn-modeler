// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { focusPropertiesPanel, togglePropertiesPanel } from "./propertiesPanelFocus";
import { initResizer, type PropertiesPanelHandle } from "./propertiesPanelResizer";
import type { PropertiesPanelUiState } from "./propertiesPanelUiState";
import {
    bindPanelVisibility,
    initialPanelVisibility,
    panelVisibilityAfter,
    type PanelVisibility,
    type PanelVisibilityEvent,
} from "./propertiesPanelVisibility";

const undecided: PanelVisibility = { decided: false };
const decided = (visible: boolean): PanelVisibility => ({ decided: true, visible });
const userToggled = (visible: boolean): PanelVisibilityEvent => ({ kind: "userToggled", visible });
const hostDefaultSettled = (visible: boolean | undefined): PanelVisibilityEvent => ({
    kind: "hostDefaultSettled",
    visible,
});

describe("panel visibility rules", () => {
    it.each([false, true])(
        "a saved visibility (%s) decides at once and is shown, not remembered",
        (saved) => {
            expect(initialPanelVisibility(saved)).toEqual({
                state: decided(saved),
                effects: [{ kind: "show", visible: saved }],
            });
        },
    );

    it("a first open waits for the host default without touching the panel", () => {
        expect(initialPanelVisibility(undefined)).toEqual({ state: undecided, effects: [] });
    });

    it.each([false, true])(
        "the host default (%s) is shown, not remembered, while undecided",
        (hostDefault) => {
            expect(panelVisibilityAfter(undecided, hostDefaultSettled(hostDefault))).toEqual({
                state: decided(hostDefault),
                effects: [{ kind: "show", visible: hostDefault }],
            });
        },
    );

    it("a missing host default opens the panel", () => {
        expect(panelVisibilityAfter(undecided, hostDefaultSettled(undefined))).toEqual({
            state: decided(true),
            effects: [{ kind: "show", visible: true }],
        });
    });

    describe("a user toggle is remembered in every phase", () => {
        it.each<[string, PanelVisibility, boolean]>([
            ["before any decision", undecided, false],
            ["before any decision, opening", undecided, true],
            ["after a saved visibility", decided(true), false],
            ["after the host default", decided(false), true],
            ["after an earlier toggle", decided(true), false],
        ])("%s", (_, state, toggledTo) => {
            expect(panelVisibilityAfter(state, userToggled(toggledTo))).toEqual({
                state: decided(toggledTo),
                effects: [{ kind: "remember", visible: toggledTo }],
            });
        });
    });

    it.each<[string, () => PanelVisibility]>([
        ["a user toggle", () => panelVisibilityAfter(undecided, userToggled(false)).state],
        ["a saved visibility", () => initialPanelVisibility(false).state],
        [
            "an earlier host default",
            () => panelVisibilityAfter(undecided, hostDefaultSettled(false)).state,
        ],
    ])("a host default after %s changes nothing", (_, reachDecision) => {
        expect(panelVisibilityAfter(reachDecision(), hostDefaultSettled(true))).toEqual({
            state: decided(false),
            effects: [],
        });
    });
});

describe("bindPanelVisibility", () => {
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
            <div id="js-properties-panel"><input /></div>
            <div id="js-panel-resizer"></div>
        `;
        const handle = initResizer({ getToggleLabel: (state) => state });
        liveHandles.push(handle);
        const store = memoryStore(saved);
        const report = vi.fn();
        const binding = bindPanelVisibility(handle, store, report);
        return { handle, store, report, binding };
    }

    const isCollapsed = () =>
        document.getElementById("js-properties-panel")!.classList.contains("collapsed");
    const clickToggle = () =>
        document.querySelector<HTMLButtonElement>(".panel-resizer-toggle")!.click();

    it("applies a saved visibility at once without remembering it", () => {
        const { store, report, binding } = bind({ panelVisible: false });

        expect(isCollapsed()).toBe(true);
        expect(binding.isDecided()).toBe(true);
        expect(store.merge).not.toHaveBeenCalled();
        expect(report).not.toHaveBeenCalled();
    });

    it("does not remember a visibility it applied itself", () => {
        const { store, report, binding } = bind();
        expect(binding.isDecided()).toBe(false);

        binding.hostDefaultSettled(false);

        expect(isCollapsed()).toBe(true);
        expect(binding.isDecided()).toBe(true);
        expect(store.merge).not.toHaveBeenCalled();
        expect(report).not.toHaveBeenCalled();
    });

    it("remembers a toggle made before the host default and keeps it", () => {
        const { store, report, binding } = bind();

        clickToggle();
        binding.hostDefaultSettled(true);

        expect(isCollapsed()).toBe(true);
        expect(binding.isDecided()).toBe(true);
        expect(store.merge).toHaveBeenCalledExactlyOnceWith({ panelVisible: false });
        expect(report).toHaveBeenCalledExactlyOnceWith(false);
    });

    it.each<[string, boolean, (handle: PropertiesPanelHandle) => void]>([
        ["Shift+P", false, (handle) => togglePropertiesPanel(handle, () => undefined)],
        ["p", true, (handle) => focusPropertiesPanel(handle, { schedule: () => undefined })],
    ])("remembers a %s toggle after boot", (_, toggledTo, pressShortcut) => {
        const { handle, store, report, binding } = bind();
        binding.hostDefaultSettled(!toggledTo);

        pressShortcut(handle);

        expect(isCollapsed()).toBe(!toggledTo);
        expect(store.merge).toHaveBeenCalledExactlyOnceWith({ panelVisible: toggledTo });
        expect(report).toHaveBeenCalledExactlyOnceWith(toggledTo);
    });
});
