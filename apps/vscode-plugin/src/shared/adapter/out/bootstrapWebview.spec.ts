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

        bootstrapWebview(viewType, panel as never);

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

    // A webview loads a resource only below a root of the URL's scheme, and the
    // plugin URLs are made from file paths.
    it("roots the plugin cache at a file: URI though global storage is vscode-userdata:", () => {
        expect(
            bpmnPluginCacheUri(mockUri("vscode-userdata", "/user/globalStorage/ext") as never),
        ).toEqual(mockUri("file", "/user/globalStorage/ext/bpmn-plugins"));
    });

    it("loads the template preview entry for the preview view type", () => {
        const panel = createPanel();

        bootstrapWebview(ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE, panel as never);

        expect(panel.webview.html).toContain("webview:extension/bpmn-webview/templateEditor.js");
    });

    it("rejects an unknown view type before touching the webview", () => {
        const panel = createPanel();

        expect(() => bootstrapWebview("unknown", panel as never)).toThrow(
            "Unsupported view type: unknown",
        );
        expect(panel.webview.options).toEqual({});
        expect(panel.webview.html).toBe("");
    });
});
