import { describe, expect, it, vi } from "vitest";

interface MockUri {
    scheme: string;
    path: string;
    fsPath: string;
}

const { mockUri } = vi.hoisted(() => ({
    mockUri: (scheme: string, path: string): MockUri => ({ scheme, path, fsPath: path }),
}));

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (base: MockUri, ...segments: string[]) =>
            mockUri(base.scheme, [base.path, ...segments].join("/")),
        file: (path: string) => mockUri("file", path),
    },
}));

vi.mock("./extensionContext", () => ({
    getContext: () => ({
        extensionUri: mockUri("file", "extension"),
        // VS Code desktop keeps an extension's global storage under its user data scheme.
        globalStorageUri: mockUri("vscode-userdata", "global-storage"),
    }),
}));

import { bootstrapWebview, bpmnPluginCacheUri } from "./bootstrapWebview";
import {
    BPMN_VIEW_TYPE,
    DMN_VIEW_TYPE,
    ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
    FORM_VIEW_TYPE,
} from "@miragon/bpmn-modeler-core";

function createPanel() {
    return {
        webview: {
            cspSource: "webview-csp:",
            asWebviewUri: ({ path }: { path: string }) => `webview:${path}`,
            options: {},
            html: "",
        },
    };
}

describe("bootstrapWebview", () => {
    it.each([
        // The BPMN editor also loads approved plugin copies, never workspace files.
        [BPMN_VIEW_TYPE, ["file:extension/bpmn-webview", "file:global-storage/bpmn-plugins"]],
        [DMN_VIEW_TYPE, ["file:extension/dmn-webview", "file:extension/assets"]],
        [FORM_VIEW_TYPE, ["file:extension/form-webview"]],
        [ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE, ["file:extension/bpmn-webview"]],
    ])("limits the %s webview to its own directories", (viewType, expectedRoots) => {
        const panel = createPanel();

        bootstrapWebview(panel as never, { viewType, initialPanelVisible: true });

        const options = panel.webview.options as {
            enableScripts?: boolean;
            localResourceRoots?: MockUri[];
        };
        expect(options.enableScripts).toBe(true);
        expect(options.localResourceRoots?.map((root) => `${root.scheme}:${root.path}`)).toEqual(
            expectedRoots,
        );
        expect(panel.webview.html).toContain("Content-Security-Policy");
    });

    it("roots the plugin cache at a file: URI though global storage is vscode-userdata:", () => {
        expect(
            bpmnPluginCacheUri(mockUri("vscode-userdata", "/user/globalStorage/ext") as never),
        ).toEqual(mockUri("file", "/user/globalStorage/ext/bpmn-plugins"));
    });

    it("loads the template preview entry for the preview view type", () => {
        const panel = createPanel();

        bootstrapWebview(panel as never, {
            viewType: ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
            initialPanelVisible: true,
        });

        expect(panel.webview.html).toContain("webview:extension/bpmn-webview/templateEditor.js");
    });

    it.each([
        ["bpmnDiffPane", ["file:extension/bpmn-webview", "file:global-storage/bpmn-plugins"]],
        ["dmnDiffPane", ["file:extension/dmn-webview", "file:extension/assets"]],
    ] as const)("limits the %s to its editor's directories", (diffPane, expectedRoots) => {
        const panel = createPanel();

        bootstrapWebview(panel as never, { diffPane });

        const options = panel.webview.options as { localResourceRoots?: MockUri[] };
        expect(options.localResourceRoots?.map((root) => `${root.scheme}:${root.path}`)).toEqual(
            expectedRoots,
        );
    });

    it("names the page of a DMN diff pane and of a DMN editor", () => {
        const diffPanel = createPanel();
        const editorPanel = createPanel();

        bootstrapWebview(diffPanel as never, { diffPane: "dmnDiffPane" });
        bootstrapWebview(editorPanel as never, {
            viewType: DMN_VIEW_TYPE,
            initialPanelVisible: true,
        });

        expect(diffPanel.webview.html).toContain('data-surface="dmnDiffPane"');
        expect(editorPanel.webview.html).toContain('data-surface="dmnEditor"');
    });

    it("loads the BPMN editor page for a BPMN diff pane, with its properties panel shown", () => {
        const panel = createPanel();

        bootstrapWebview(panel as never, { diffPane: "bpmnDiffPane" });

        expect(panel.webview.html).toContain("webview:extension/bpmn-webview/index.js");
        expect(panel.webview.html).not.toContain("collapsed");
    });

    it("renders an editor's properties panel collapsed when the host hides it", () => {
        const panel = createPanel();

        bootstrapWebview(panel as never, { viewType: DMN_VIEW_TYPE, initialPanelVisible: false });

        expect(panel.webview.html).toContain("properties-panel-parent collapsed");
    });

    it("rejects an unknown view type before touching the webview", () => {
        const panel = createPanel();

        expect(() =>
            bootstrapWebview(panel as never, { viewType: "unknown", initialPanelVisible: true }),
        ).toThrow(
            "Unsupported view type: unknown",
        );
        expect(panel.webview.options).toEqual({});
        expect(panel.webview.html).toBe("");
    });
});
