import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeFileSystemFake"));

import type { AddOnsPage, BrandMode } from "@miragon/bpmn-modeler-shared";

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

const renderAddOns = (mode: BrandMode = { theme: "light" }, page: AddOnsPage = "list") =>
    addOnsViewHtml(shellWebview, shellExtensionUri, createWebviewNonce(), mode, page);

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

    it.each<AddOnsPage>(["listWithTab", "detail"])(
        "tells the bundle it serves the %s page",
        (page) => {
            expect(renderAddOns({ theme: "light" }, page)).toContain(`data-add-ons-page="${page}"`);
        },
    );

    // The bundle builds the outline from the core's model; the shell carries no markup.
    it("gives the bundle a single empty app root to render into", () => {
        const html = renderAddOns();

        expect(tagsOf(html, "div")).toEqual([{ id: "app" }]);
        expect(html).toContain('<div id="app"></div>');
    });

    // Written here, so the first frame paints in the mode; the page only follows changes.
    it.each([
        { mode: { theme: "light" }, html: { "lang": "en", "data-cd-theme": "light" } },
        { mode: { theme: "dark" }, html: { "lang": "en", "data-cd-theme": "dark" } },
        {
            mode: { theme: "dark", contrast: "hoch" },
            html: { "lang": "en", "data-cd-theme": "dark", "data-cd-kontrast": "hoch" },
        },
    ] as const)("marks the page with the $mode.theme brand mode", ({ mode, html }) => {
        expect(tagsOf(renderAddOns(mode), "html")).toEqual([
            { ...html, "data-add-ons-page": "list" },
        ]);
    });
});
