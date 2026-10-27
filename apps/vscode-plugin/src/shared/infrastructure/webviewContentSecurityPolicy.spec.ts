import { describe, expect, it } from "vitest";

import { webviewContentSecurityPolicy, type WebviewShell } from "./webviewContentSecurityPolicy";

const sources = { cspSource: "webview-csp:", nonce: "n0nce" };

describe("webviewContentSecurityPolicy", () => {
    it.each<{ shell: WebviewShell; directives: string[] }>([
        {
            shell: "bpmn",
            directives: [
                "default-src 'none'",
                "script-src 'nonce-n0nce' webview-csp:",
                "style-src webview-csp: 'unsafe-inline'",
                "img-src webview-csp: data: https:",
                "font-src webview-csp: data:",
                "base-uri 'none'",
                "form-action 'none'",
            ],
        },
        {
            shell: "dmn",
            directives: [
                "default-src 'none'",
                "script-src 'nonce-n0nce' webview-csp:",
                "style-src webview-csp: 'unsafe-inline'",
                "img-src webview-csp: data:",
                "font-src webview-csp: data:",
                "base-uri 'none'",
                "form-action 'none'",
            ],
        },
        {
            shell: "form",
            directives: [
                "default-src 'none'",
                "script-src 'nonce-n0nce'",
                "style-src webview-csp: 'unsafe-inline'",
                "img-src webview-csp: data: blob: https:",
                "font-src webview-csp: data:",
                "connect-src https:",
                "frame-src https:",
                "object-src blob:",
                "base-uri 'none'",
                "form-action 'none'",
            ],
        },
        {
            shell: "deployment",
            directives: [
                "default-src 'none'",
                "script-src 'nonce-n0nce'",
                "style-src webview-csp: 'unsafe-inline'",
                "base-uri 'none'",
                "form-action 'none'",
            ],
        },
    ])("allows the $shell bundle only what it loads", ({ shell, directives }) => {
        expect(webviewContentSecurityPolicy(shell, sources).split("; ")).toEqual(directives);
    });

    it("allows the entry script by the nonce of this render", () => {
        const policy = webviewContentSecurityPolicy("deployment", {
            cspSource: "vscode-webview://other",
            nonce: "fresh",
        });

        expect(policy).toBe(
            "default-src 'none'; script-src 'nonce-fresh'; style-src vscode-webview://other 'unsafe-inline'; base-uri 'none'; form-action 'none'",
        );
    });
});
