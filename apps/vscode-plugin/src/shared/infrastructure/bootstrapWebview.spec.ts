import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (base: { path: string }, ...segments: string[]) => ({
            path: [base.path, ...segments].join("/"),
        }),
    },
}));

vi.mock("./extensionContext", () => ({
    getContext: () => ({ extensionUri: { path: "extension" } }),
}));

import { bootstrapWebview } from "./bootstrapWebview";
import { BPMN_VIEW_TYPE, DMN_VIEW_TYPE, FORM_VIEW_TYPE } from "@miragon/bpmn-modeler-core";

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
        [BPMN_VIEW_TYPE, ["extension/bpmn-webview"]],
        [DMN_VIEW_TYPE, ["extension/dmn-webview", "extension/assets"]],
        [FORM_VIEW_TYPE, ["extension/form-webview"]],
    ])("limits the %s webview to its own bundle directories", (viewType, expectedRoots) => {
        const panel = createPanel();

        bootstrapWebview(viewType, panel as never);

        expect(panel.webview.options).toEqual({
            enableScripts: true,
            localResourceRoots: expectedRoots.map((path) => ({ path })),
        });
        expect(panel.webview.html).toContain("Content-Security-Policy");
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
