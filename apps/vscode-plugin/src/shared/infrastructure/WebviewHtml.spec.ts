import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (base: { path: string }, ...segments: string[]) => ({
            path: [base.path, ...segments].join("/"),
        }),
    },
}));

import { formEditorHtml } from "./WebviewHtml";

describe("formEditorHtml", () => {
    it("allows the HTTPS resources used by supported form components", () => {
        const webview = {
            cspSource: "webview-csp:",
            asWebviewUri: ({ path }: { path: string }) => `webview:${path}`,
        };

        const html = formEditorHtml(webview as never, { path: "extension" } as never);

        expect(html).toContain("img-src webview-csp: data: blob: https:");
        expect(html).toContain("connect-src https:");
        expect(html).toContain("frame-src https:");
        expect(html).toContain("object-src blob:");
    });
});
