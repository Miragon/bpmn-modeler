import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../__fixtures__/vscodeFileSystemFake"));

import {
    contentSecurityPolicyOf,
    scriptNonceOf,
    shellExtensionUri,
    shellWebview,
    stylesheetsOf,
    tagsOf,
} from "../../__fixtures__/webviewShell";
import { webviewContentSecurityPolicy } from "../../shared/infrastructure/webviewContentSecurityPolicy";
import { deploymentWebviewHtml } from "./DeploymentWebviewHtml";

const renderDeployment = () => deploymentWebviewHtml(shellWebview, shellExtensionUri);

describe("deploymentWebviewHtml", () => {
    it("carries the deployment shell policy for the nonce of this render", () => {
        const html = renderDeployment();

        expect(contentSecurityPolicyOf(html)).toBe(
            webviewContentSecurityPolicy("deployment", {
                cspSource: shellWebview.cspSource,
                nonce: scriptNonceOf(html),
            }),
        );
    });

    it("loads the deployment stylesheet and runs only its entry script, by the policy's nonce", () => {
        const html = renderDeployment();

        expect(stylesheetsOf(html)).toEqual([
            "https://webview.test/extension/deployment-webview/index.css",
        ]);
        expect(tagsOf(html, "script")).toEqual([
            {
                nonce: scriptNonceOf(html),
                src: "https://webview.test/extension/deployment-webview/index.js",
            },
        ]);
    });

    // The bundle renders the form from its own template; the shell carries no copy.
    it("gives the bundle a single empty app root to render into", () => {
        const html = renderDeployment();

        expect(tagsOf(html, "div")).toEqual([{ id: "app" }]);
        expect(html).toContain('<div id="app"></div>');
    });
});
