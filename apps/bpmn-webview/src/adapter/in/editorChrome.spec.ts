import { afterEach, describe, expect, it, vi } from "vitest";

import type { Command, Query } from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../../port/webviewState";
import { type EditorChrome, mountEditorChrome } from "./editorChrome";

function createHost(state: WebviewState | undefined = undefined) {
    const posted: (Command | Query)[] = [];
    return {
        posted,
        getState: vi.fn(() => state),
        updateState: vi.fn(),
        postMessage: vi.fn((message: Command | Query) => {
            posted.push(message);
        }),
    };
}

const focus = { focusCanvas: () => undefined, isCanvasFocused: () => false };
const mounted: EditorChrome[] = [];

function mount(host = createHost()): EditorChrome {
    document.body.innerHTML = `<div id="app"></div>`;
    const chrome = mountEditorChrome(host, focus)!;
    mounted.push(chrome);
    return chrome;
}

const pressShiftP = () =>
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "P", shiftKey: true }));

describe("mountEditorChrome", () => {
    afterEach(() => {
        mounted.splice(0).forEach((chrome) => chrome.dispose());
        document.body.innerHTML = "";
    });

    it("reports a host page without its root", () => {
        const host = createHost();

        expect(mountEditorChrome(host, focus)).toBeUndefined();

        expect(host.posted).toEqual([
            expect.objectContaining({
                type: "LogErrorCommand",
                message: "Missing #app in host HTML",
            }),
        ]);
    });

    it("puts the mode strip on the canvas and marks the panel as its host", () => {
        const chrome = mount();

        expect(chrome.canvas.firstElementChild).toBe(chrome.stripEl);
        expect(chrome.stripEl.id).toBe("js-mode-strip");
        expect(chrome.stripEl.className).toBe("mode-strip");
        expect(chrome.panelHost.classList).toContain("panel-host");
        expect(chrome.panelMount.id).toBe("js-properties-panel-mount");
    });

    it("applies this editor's saved panel visibility at once", () => {
        const chrome = mount(createHost({ panelVisible: false }));

        expect(chrome.visibility.isDecided()).toBe(true);
        expect(chrome.panel.isVisible()).toBe(false);
    });

    it("saves and reports a panel toggle as this editor's choice", () => {
        const host = createHost();
        const chrome = mount(host);

        chrome.panel.setVisible(false);

        expect(host.updateState).toHaveBeenCalledExactlyOnceWith({ panelVisible: false });
        expect(host.posted).toEqual([
            expect.objectContaining({ type: "SetPropertiesPanelStateCommand", visible: false }),
        ]);
    });

    it("leaves Shift+P alone until the editor opens the shortcuts", () => {
        const chrome = mount();

        pressShiftP();
        expect(chrome.panel.isVisible()).toBe(true);

        chrome.enableShortcuts();
        pressShiftP();
        expect(chrome.panel.isVisible()).toBe(false);
    });
});
