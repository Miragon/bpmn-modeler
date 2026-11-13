import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeFileSystemFake"));

import {
    describeShellPolicy,
    scriptNonceOf,
    shellExtensionUri,
    shellWebview,
    stylesheetsOf,
    tagsOf,
} from "../../../__fixtures__/webviewShell";
import { INITIALLY_COLLAPSED_PANEL_ATTRIBUTE } from "@miragon/bpmn-modeler-shared";

import {
    bpmnEditorUi,
    dmnModelerHtml,
    elementTemplateEditorHtml,
    formEditorHtml,
} from "./WebviewHtml";

type ShellBuilder = (initialPanelVisible?: boolean) => string;

const renderBpmn: ShellBuilder = (initialPanelVisible) =>
    bpmnEditorUi(shellWebview, shellExtensionUri, initialPanelVisible);
const renderDmn: ShellBuilder = (initialPanelVisible) =>
    dmnModelerHtml(shellWebview, shellExtensionUri, { surface: "dmnEditor", initialPanelVisible });
const renderForm: ShellBuilder = () => formEditorHtml(shellWebview, shellExtensionUri);

describe("bpmnEditorUi", () => {
    describeShellPolicy("bpmn", renderBpmn);

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

describe("elementTemplateEditorHtml", () => {
    const render = () => elementTemplateEditorHtml(shellWebview, shellExtensionUri);

    // The preview is a second entry of the BPMN bundle, so it shares its policy.
    describeShellPolicy("bpmn", render);

    it("loads the BPMN stylesheet and runs only the preview's nonced module entry", () => {
        const html = render();

        expect(stylesheetsOf(html)).toEqual([
            "https://webview.test/extension/bpmn-webview/index.css",
        ]);
        expect(tagsOf(html, "script")).toEqual([
            {
                type: "module",
                nonce: scriptNonceOf(html),
                src: "https://webview.test/extension/bpmn-webview/templateEditor.js",
            },
        ]);
        expect(tagsOf(html, "div")).toEqual([{ id: "app" }]);
    });
});

describe("dmnModelerHtml", () => {
    describeShellPolicy("dmn", renderDmn);

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

describe("dmnModelerHtml for a diff pane", () => {
    const renderDiffPane = () =>
        dmnModelerHtml(shellWebview, shellExtensionUri, { surface: "dmnDiffPane" });

    describeShellPolicy("dmn", renderDiffPane);

    it("names the page a DMN diff pane with an empty root for the bundle", () => {
        const html = renderDiffPane();

        expect(tagsOf(html, "body")).toEqual([{ "data-surface": "dmnDiffPane" }]);
        expect(tagsOf(html, "div")).toEqual([{ id: "app" }]);
    });

    it("names the editor page a DMN editor", () => {
        expect(tagsOf(renderDmn(), "body")).toEqual([{ "data-surface": "dmnEditor" }]);
    });
});

describe.each([
    ["bpmnEditorUi", renderBpmn],
    ["dmnModelerHtml", renderDmn],
])("%s properties panel", (_shell, render) => {
    it.each([
        ["by default", undefined],
        ["when the host shows it", true],
    ])("ships an empty root the bundle mounts the page into %s", (_case, initialPanelVisible) => {
        expect(tagsOf(render(initialPanelVisible), "div")).toEqual([{ id: "app" }]);
    });

    // Marked on the root, so the bundle mounts the panel collapsed and it cannot flash open.
    it("marks the root to mount the panel collapsed when the host hides it", () => {
        expect(tagsOf(render(false), "div")).toEqual([
            { id: "app", [INITIALLY_COLLAPSED_PANEL_ATTRIBUTE]: "" },
        ]);
    });
});

describe("formEditorHtml", () => {
    describeShellPolicy("form", renderForm);

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
