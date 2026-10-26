import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
    Uri: {
        joinPath: (base: { path: string }, ...segments: string[]) => ({
            path: [base.path, ...segments].join("/"),
        }),
    },
}));

import { bpmnEditorUi, dmnModelerHtml, formEditorHtml } from "./WebviewHtml";

const webview = {
    cspSource: "webview-csp:",
    asWebviewUri: ({ path }: { path: string }) => `webview:${path}`,
};
const extensionUri = { path: "extension" };

function contentSecurityPolicyOf(html: string): Map<string, string> {
    const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
    if (policy === undefined) {
        throw new Error("The shell carries no Content-Security-Policy.");
    }
    const directives = policy
        .split(";")
        .map((directive) => directive.trim())
        .filter((directive) => directive.length > 0)
        .map((directive): [string, string] => {
            const [name, ...sources] = directive.split(/\s+/);
            return [name, sources.join(" ")];
        });
    return new Map(directives);
}

function entryScriptNonceOf(html: string): string {
    const nonce =
        /<script type="module" nonce="([^"]+)" src="webview:extension\/[a-z-]+\/index\.js">/.exec(
            html,
        )?.[1];
    if (nonce === undefined) {
        throw new Error("The shell carries no nonced entry script.");
    }
    return nonce;
}

describe("bpmnEditorUi", () => {
    const html = bpmnEditorUi(webview as never, extensionUri as never);
    const policy = contentSecurityPolicyOf(html);

    it("pins the policy the BPMN bundle needs and nothing more", () => {
        expect(Object.fromEntries(policy)).toEqual({
            "default-src": "'none'",
            "script-src": `'nonce-${entryScriptNonceOf(html)}' webview-csp:`,
            "style-src": "webview-csp: 'unsafe-inline'",
            "img-src": "webview-csp: data: https:",
            "font-src": "webview-csp: data:",
            "base-uri": "'none'",
            "form-action": "'none'",
        });
    });

    it("issues a fresh nonce per render", () => {
        const nextHtml = bpmnEditorUi(webview as never, extensionUri as never);

        expect(entryScriptNonceOf(nextHtml)).not.toBe(entryScriptNonceOf(html));
        expect(contentSecurityPolicyOf(nextHtml).get("script-src")).toContain(
            `'nonce-${entryScriptNonceOf(nextHtml)}'`,
        );
    });
});

describe("dmnModelerHtml", () => {
    it("pins the policy the DMN bundle needs and nothing more", () => {
        const html = dmnModelerHtml(webview as never, extensionUri as never);

        expect(Object.fromEntries(contentSecurityPolicyOf(html))).toEqual({
            "default-src": "'none'",
            "script-src": `'nonce-${entryScriptNonceOf(html)}' webview-csp:`,
            "style-src": "webview-csp: 'unsafe-inline'",
            "img-src": "webview-csp: data:",
            "font-src": "webview-csp: data:",
            "base-uri": "'none'",
            "form-action": "'none'",
        });
    });
});

describe("formEditorHtml", () => {
    it("allows the HTTPS resources used by supported form components", () => {
        const html = formEditorHtml(webview as never, extensionUri as never);

        expect(html).toContain("img-src webview-csp: data: blob: https:");
        expect(html).toContain("connect-src https:");
        expect(html).toContain("frame-src https:");
        expect(html).toContain("object-src blob:");
    });

    it("only runs the nonced entry script", () => {
        const html = formEditorHtml(webview as never, extensionUri as never);
        const nonce =
            /<script nonce="([^"]+)" src="webview:extension\/form-webview\/index\.js">/.exec(
                html,
            )?.[1];

        expect(nonce).toBeDefined();
        expect(contentSecurityPolicyOf(html).get("script-src")).toBe(`'nonce-${nonce}'`);
    });
});
