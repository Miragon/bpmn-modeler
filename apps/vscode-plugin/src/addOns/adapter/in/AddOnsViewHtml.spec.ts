import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeFileSystemFake"));

import {
    describeShellPolicy,
    scriptNonceOf,
    shellExtensionUri,
    shellWebview,
    stylesheetsOf,
    tagsOf,
} from "../../../__fixtures__/webviewShell";
import { createWebviewNonce } from "../../../shared/adapter/out/webviewNonce";
import { addOnsViewHtml } from "./AddOnsViewHtml";

const renderAddOns = () => addOnsViewHtml(shellWebview, shellExtensionUri, createWebviewNonce());

describe("addOnsViewHtml", () => {
    describeShellPolicy("addOns", renderAddOns);

    it("loads the add-ons stylesheet and runs only its entry script, by the policy's nonce", () => {
        const html = renderAddOns();

        expect(stylesheetsOf(html)).toEqual([
            "https://webview.test/extension/add-ons-webview/index.css",
        ]);
        expect(tagsOf(html, "script")).toEqual([
            {
                nonce: scriptNonceOf(html),
                src: "https://webview.test/extension/add-ons-webview/index.js",
            },
        ]);
    });

    // The bundle builds the outline from the core's model; the shell carries no markup.
    it("gives the bundle a single empty app root to render into", () => {
        const html = renderAddOns();

        expect(tagsOf(html, "div")).toEqual([{ id: "app" }]);
        expect(html).toContain('<div id="app"></div>');
    });
});
