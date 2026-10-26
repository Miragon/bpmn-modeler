import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (base: { path: string }, ...segments: string[]) => ({
            path: [base.path, ...segments].join("/"),
        }),
    },
}));

import { deploymentWebviewHtml } from "./DeploymentWebviewHtml";

describe("deploymentWebviewHtml", () => {
    it("only runs the nonced entry script and the bundle's own styles", () => {
        const webview = {
            cspSource: "webview-csp:",
            asWebviewUri: ({ path }: { path: string }) => `webview:${path}`,
        };

        const html = deploymentWebviewHtml(webview as never, { path: "extension" } as never);
        const policy = /content="(default-src[^"]*)"/.exec(html)?.[1].replace(/\s+/g, " ");
        const nonce =
            /<script nonce="([^"]+)" src="webview:extension\/deployment-webview\/index\.js">/.exec(
                html,
            )?.[1];

        expect(nonce).toBeDefined();
        expect(policy).toBe(
            `default-src 'none'; style-src webview-csp: 'unsafe-inline'; script-src 'nonce-${nonce}';`,
        );
    });
});
