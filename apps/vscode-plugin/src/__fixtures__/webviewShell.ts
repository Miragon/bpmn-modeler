/**
 * Renders webview HTML shells against a fixed webview and reads back what they
 * declare. Specs mock `vscode` with `vscodeFileSystemFake` for its `Uri`.
 */
import { Uri, type Webview } from "vscode";

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

export function contentSecurityPolicyOf(html: string): string {
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
