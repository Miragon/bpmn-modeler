import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../__fixtures__/vscodeFileSystemFake"));

import {
    directivesOf,
    scriptNonceOf,
    shellExtensionUri,
    shellWebview,
    stylesheetsOf,
    tagsOf,
} from "../../__fixtures__/webviewShell";
import { bpmnEditorUi, dmnModelerHtml, formEditorHtml } from "./WebviewHtml";

type ShellBuilder = (initialPanelVisible?: boolean) => string;

const renderBpmn: ShellBuilder = (initialPanelVisible) =>
    bpmnEditorUi(shellWebview, shellExtensionUri, initialPanelVisible);
const renderDmn: ShellBuilder = (initialPanelVisible) =>
    dmnModelerHtml(shellWebview, shellExtensionUri, initialPanelVisible);
const renderForm: ShellBuilder = () => formEditorHtml(shellWebview, shellExtensionUri);

function elementById(html: string, id: string): Record<string, string> {
    const element = tagsOf(html, "div").find((attributes) => attributes.id === id);
    if (element === undefined) {
        throw new Error(`The shell has no #${id}.`);
    }
    return element;
}

describe("bpmnEditorUi", () => {
    it("pins the policy the BPMN bundle needs and nothing more", () => {
        const html = renderBpmn();

        expect(directivesOf(html)).toEqual({
            "default-src": "'none'",
            "script-src": `'nonce-${scriptNonceOf(html)}' webview-csp:`,
            "style-src": "webview-csp: 'unsafe-inline'",
            "img-src": "webview-csp: data: https:",
            "font-src": "webview-csp: data:",
            "base-uri": "'none'",
            "form-action": "'none'",
        });
    });

    // A module script: the bundle's chunks resolve their URLs through import.meta.url.
    it("loads the BPMN stylesheet and runs only its nonced module entry", () => {
        const html = renderBpmn();

        expect(stylesheetsOf(html)).toEqual([
            "https://webview.test/extension/bpmn-webview/index.css",
        ]);
        expect(tagsOf(html, "script")).toEqual([
            {
                type: "module",
                nonce: scriptNonceOf(html),
                src: "https://webview.test/extension/bpmn-webview/index.js",
            },
        ]);
    });
});

describe("dmnModelerHtml", () => {
    it("pins the policy the DMN bundle needs and nothing more", () => {
        const html = renderDmn();

        expect(directivesOf(html)).toEqual({
            "default-src": "'none'",
            "script-src": `'nonce-${scriptNonceOf(html)}' webview-csp:`,
            "style-src": "webview-csp: 'unsafe-inline'",
            "img-src": "webview-csp: data:",
            "font-src": "webview-csp: data:",
            "base-uri": "'none'",
            "form-action": "'none'",
        });
    });

    it("loads the reset and DMN stylesheets and runs only its nonced module entry", () => {
        const html = renderDmn();

        expect(stylesheetsOf(html)).toEqual([
            "https://webview.test/extension/assets/reset.css",
            "https://webview.test/extension/dmn-webview/index.css",
        ]);
        expect(tagsOf(html, "script")).toEqual([
            {
                type: "module",
                nonce: scriptNonceOf(html),
                src: "https://webview.test/extension/dmn-webview/index.js",
            },
        ]);
    });
});

describe.each([
    ["bpmnEditorUi", renderBpmn],
    ["dmnModelerHtml", renderDmn],
])("%s properties panel", (_shell, render) => {
    it("lays out the drop zone, canvas, resizer and panel the bundle mounts into", () => {
        const ids = tagsOf(render(), "div").map((attributes) => attributes.id);

        expect(ids).toEqual([
            "js-drop-zone",
            "js-canvas",
            "js-panel-resizer",
            "js-properties-panel",
        ]);
    });

    it.each([
        ["by default", undefined],
        ["when the host shows it", true],
    ])("renders the panel expanded %s", (_case, initialPanelVisible) => {
        const html = render(initialPanelVisible);

        expect(elementById(html, "js-properties-panel")).toEqual({
            class: "properties-panel-parent",
            id: "js-properties-panel",
        });
        expect(elementById(html, "js-panel-resizer").class).toBe("panel-resizer");
    });

    // Collapsed in the markup, so the panel cannot flash open before the bundle applies its state.
    it("renders the panel and its resizer collapsed when the host hides it", () => {
        const html = render(false);

        expect(elementById(html, "js-properties-panel")).toEqual({
            class: "properties-panel-parent collapsed",
            id: "js-properties-panel",
            style: "width: 0",
        });
        expect(elementById(html, "js-panel-resizer").class).toBe("panel-resizer collapsed");
    });
});

describe("formEditorHtml", () => {
    it("pins the policy the form editor and its HTTPS form components need", () => {
        const html = renderForm();

        expect(directivesOf(html)).toEqual({
            "default-src": "'none'",
            "img-src": "webview-csp: data: blob: https:",
            "font-src": "webview-csp: data:",
            "style-src": "webview-csp: 'unsafe-inline'",
            "script-src": `'nonce-${scriptNonceOf(html)}'`,
            "connect-src": "https:",
            "frame-src": "https:",
            "object-src": "blob:",
            "base-uri": "'none'",
            "form-action": "'none'",
        });
    });

    it("loads the form stylesheet and runs only its nonced entry script", () => {
        const html = renderForm();

        expect(stylesheetsOf(html)).toEqual([
            "https://webview.test/extension/form-webview/styles.css",
        ]);
        expect(tagsOf(html, "script")).toEqual([
            {
                nonce: scriptNonceOf(html),
                src: "https://webview.test/extension/form-webview/index.js",
            },
        ]);
    });

    it("gives the bundle a single app root to render into", () => {
        expect(tagsOf(renderForm(), "div")).toEqual([{ id: "app" }]);
    });
});

describe.each([
    ["bpmnEditorUi", renderBpmn],
    ["dmnModelerHtml", renderDmn],
    ["formEditorHtml", renderForm],
])("%s nonce", (_shell, render) => {
    it("issues a fresh nonce per render", () => {
        const nonces = [scriptNonceOf(render()), scriptNonceOf(render())];

        expect(nonces[0]).not.toBe(nonces[1]);
    });

    it("allows the entry script by the same nonce it carries", () => {
        const html = render();

        expect(tagsOf(html, "script").map((script) => script.nonce)).toEqual([scriptNonceOf(html)]);
    });
});
