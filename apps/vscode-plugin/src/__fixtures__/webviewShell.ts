/**
 * A fixed webview for rendering shells, readers for what a shell declares, and
 * the policy checks every shell runs. Specs mock `vscode` with
 * `vscodeFileSystemFake` for its `Uri`.
 */
import { describe, expect, it } from "vitest";
import { Uri, type Webview } from "vscode";

import {
    webviewContentSecurityPolicy,
    type WebviewShell,
} from "../shared/infrastructure/webviewContentSecurityPolicy";

export const shellWebview: Webview = {
    options: {},
    html: "",
    cspSource: "webview-csp:",
    asWebviewUri: (resource) =>
        Uri.from({ scheme: "https", authority: "webview.test", path: resource.path }),
    onDidReceiveMessage: () => ({ dispose: () => undefined }),
    postMessage: async () => true,
};

export const shellExtensionUri = Uri.file("/extension");

function attributesOf(tag: string): Record<string, string> {
    return Object.fromEntries(
        [...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
    );
}

export function tagsOf(html: string, element: string): Record<string, string>[] {
    return [...html.matchAll(new RegExp(`<${element}\\b[^>]*>`, "g"))].map(([tag]) =>
        attributesOf(tag),
    );
}

export function stylesheetsOf(html: string): string[] {
    return tagsOf(html, "link")
        .filter((link) => link.rel === "stylesheet")
        .map((link) => link.href);
}

function contentSecurityPolicyOf(html: string): string {
    const policy = tagsOf(html, "meta").find(
        (meta) => meta["http-equiv"] === "Content-Security-Policy",
    )?.content;
    if (policy === undefined) {
        throw new Error("The shell carries no Content-Security-Policy.");
    }
    return policy;
}

export function scriptNonceOf(html: string): string {
    const nonce = /script-src 'nonce-([^']+)'/.exec(contentSecurityPolicyOf(html))?.[1];
    if (nonce === undefined) {
        throw new Error("The policy allows no nonced script.");
    }
    return nonce;
}

/** The policy rules every webview shell keeps, run against one shell's renderer. */
export function describeShellPolicy(shell: WebviewShell, render: () => string): void {
    describe(`the ${shell} shell policy`, () => {
        it("is the builder's policy for the nonce of this render", () => {
            const html = render();

            expect(contentSecurityPolicyOf(html)).toBe(
                webviewContentSecurityPolicy(shell, {
                    cspSource: shellWebview.cspSource,
                    nonce: scriptNonceOf(html),
                }),
            );
        });

        it("issues a fresh nonce per render", () => {
            expect(scriptNonceOf(render())).not.toBe(scriptNonceOf(render()));
        });
    });
}
