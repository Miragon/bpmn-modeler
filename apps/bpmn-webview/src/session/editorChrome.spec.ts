import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "@miragon/bpmn-modeler-i18n";
import type { Command, Query } from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../webviewState";
import { mountEditorChrome } from "./editorChrome";

const mocks = vi.hoisted(() => ({
    panel: { setVisible: vi.fn(), onVisibilityChanged: vi.fn() },
    initResizer: vi.fn(),
}));

vi.mock("@miragon/bpmn-modeler-shared", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@miragon/bpmn-modeler-shared")>();
    return { ...actual, initResizer: mocks.initResizer };
});

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

const editorShell = `
    <div id="js-canvas"><svg></svg></div>
    <div id="js-panel-resizer"></div>
    <div id="js-properties-panel"></div>
`;

describe("mountEditorChrome", () => {
    beforeEach(() => {
        mocks.initResizer.mockReturnValue(mocks.panel);
    });

    afterEach(() => {
        document.body.innerHTML = "";
        vi.clearAllMocks();
    });

    it.each([
        ["canvas", `<div id="js-properties-panel"></div>`],
        ["properties panel", `<div id="js-canvas"></div>`],
    ])("reports a host page without the %s", (_missing, shell) => {
        document.body.innerHTML = shell;
        const host = createHost();

        expect(mountEditorChrome(host)).toBeUndefined();

        expect(host.posted).toEqual([
            expect.objectContaining({
                type: "LogErrorCommand",
                message: "Missing #js-canvas or #js-properties-panel in host HTML",
            }),
        ]);
        expect(mocks.initResizer).not.toHaveBeenCalled();
        expect(document.getElementById("js-mode-strip")).toBeNull();
    });

    it("puts the mode strip on the canvas and the panel mount into the panel host", () => {
        document.body.innerHTML = editorShell;

        const chrome = mountEditorChrome(createHost())!;

        const canvas = document.getElementById("js-canvas")!;
        const panelHost = document.getElementById("js-properties-panel")!;
        expect(chrome.canvas).toBe(canvas);
        expect(chrome.panelHost).toBe(panelHost);
        expect(panelHost.classList.contains("panel-host")).toBe(true);
        expect(canvas.firstElementChild).toBe(chrome.stripEl);
        expect(chrome.stripEl.id).toBe("js-mode-strip");
        expect(chrome.stripEl.className).toBe("mode-strip");
        expect(panelHost.lastElementChild).toBe(chrome.panelMount);
        expect(chrome.panelMount.id).toBe("js-properties-panel-mount");
        expect(chrome.panelMount.className).toBe("panel-mount");
        expect(chrome.panel).toBe(mocks.panel);
    });

    it("labels the panel toggle with its shortcut and relabels it on a language change", () => {
        document.body.innerHTML = editorShell;
        const onLanguageChange = vi.spyOn(i18n, "onChange");

        mountEditorChrome(createHost());

        const { getToggleLabel, onLabelChange } = mocks.initResizer.mock.calls[0][0];
        expect(getToggleLabel("collapsed")).toBe("Open properties panel (Shift+P)");
        expect(getToggleLabel("open")).toBe("Close properties panel (Shift+P)");
        const relabel = vi.fn();
        onLabelChange(relabel);
        expect(onLanguageChange).toHaveBeenCalledExactlyOnceWith(relabel);
        onLanguageChange.mockRestore();
    });

    it.each([false, true])(
        "applies this editor's saved panel visibility (%s) at once",
        (visible) => {
            document.body.innerHTML = editorShell;

            const chrome = mountEditorChrome(createHost({ panelVisible: visible }))!;

            expect(chrome.savedPanelVisible).toBe(visible);
            expect(mocks.panel.setVisible).toHaveBeenCalledExactlyOnceWith(visible);
        },
    );

    it.each([
        ["no webview state yet", undefined],
        ["no saved panel entry", {}],
    ])("leaves the panel to the host default with %s", (_label, state) => {
        document.body.innerHTML = editorShell;

        const chrome = mountEditorChrome(createHost(state))!;

        expect(chrome.savedPanelVisible).toBeUndefined();
        expect(mocks.panel.setVisible).not.toHaveBeenCalled();
    });
});
