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

type ShellBuilder = (initialPanelVisible?: boolean) => string;

const renderBpmn: ShellBuilder = (initialPanelVisible) =>
    bpmnEditorUi(webview as never, extensionUri as never, initialPanelVisible);
const renderDmn: ShellBuilder = (initialPanelVisible) =>
    dmnModelerHtml(webview as never, extensionUri as never, initialPanelVisible);
const renderForm: ShellBuilder = () => formEditorHtml(webview as never, extensionUri as never);

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

function attributesOf(tag: string): Record<string, string> {
    return Object.fromEntries(
        [...tag.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
    );
}

function tagsOf(html: string, element: string): Record<string, string>[] {
    return [...html.matchAll(new RegExp(`<${element}\\b[^>]*>`, "g"))].map(([tag]) =>
        attributesOf(tag),
    );
}

function stylesheetsOf(html: string): string[] {
    return tagsOf(html, "link")
        .filter((link) => link.rel === "stylesheet")
        .map((link) => link.href);
}

function elementById(html: string, id: string): Record<string, string> {
    const element = tagsOf(html, "div").find((attributes) => attributes.id === id);
    if (element === undefined) {
        throw new Error(`The shell has no #${id}.`);
    }
    return element;
}

function scriptNonceOf(html: string): string {
    const nonce = /'nonce-([^']+)'/.exec(
        contentSecurityPolicyOf(html).get("script-src") ?? "",
    )?.[1];
    if (nonce === undefined) {
        throw new Error("The policy allows no nonced script.");
    }
    return nonce;
}

describe("bpmnEditorUi", () => {
    it("pins the policy the BPMN bundle needs and nothing more", () => {
        const html = renderBpmn();

        expect(Object.fromEntries(contentSecurityPolicyOf(html))).toEqual({
            "default-src": "'none'",
            "script-src": `'nonce-${scriptNonceOf(html)}' webview-csp:`,
            "style-src": "webview-csp: 'unsafe-inline'",
            "img-src": "webview-csp: data: https:",
            "font-src": "webview-csp: data:",
            "base-uri": "'none'",
            "form-action": "'none'",
        });
    });

    // A module script: the bundle's chunks resolve their URLs through import.meta.url.
    it("loads the BPMN stylesheet and runs only its nonced module entry", () => {
        const html = renderBpmn();

        expect(stylesheetsOf(html)).toEqual(["webview:extension/bpmn-webview/index.css"]);
        expect(tagsOf(html, "script")).toEqual([
            {
                type: "module",
                nonce: scriptNonceOf(html),
                src: "webview:extension/bpmn-webview/index.js",
            },
        ]);
    });
});

describe("dmnModelerHtml", () => {
    it("pins the policy the DMN bundle needs and nothing more", () => {
        const html = renderDmn();

        expect(Object.fromEntries(contentSecurityPolicyOf(html))).toEqual({
            "default-src": "'none'",
            "script-src": `'nonce-${scriptNonceOf(html)}' webview-csp:`,
            "style-src": "webview-csp: 'unsafe-inline'",
            "img-src": "webview-csp: data:",
            "font-src": "webview-csp: data:",
            "base-uri": "'none'",
            "form-action": "'none'",
        });
    });

    it("loads the reset and DMN stylesheets and runs only its nonced module entry", () => {
        const html = renderDmn();

        expect(stylesheetsOf(html)).toEqual([
            "webview:extension/assets/reset.css",
            "webview:extension/dmn-webview/index.css",
        ]);
        expect(tagsOf(html, "script")).toEqual([
            {
                type: "module",
                nonce: scriptNonceOf(html),
                src: "webview:extension/dmn-webview/index.js",
            },
        ]);
    });
});

describe.each([
    ["bpmnEditorUi", renderBpmn],
    ["dmnModelerHtml", renderDmn],
])("%s properties panel", (_shell, render) => {
    it("lays out the drop zone, canvas, resizer and panel the bundle mounts into", () => {
        const ids = tagsOf(render(), "div").map((attributes) => attributes.id);

        expect(ids).toEqual([
            "js-drop-zone",
            "js-canvas",
            "js-panel-resizer",
            "js-properties-panel",
        ]);
    });

    it.each([
        ["by default", undefined],
        ["when the host shows it", true],
    ])("renders the panel expanded %s", (_case, initialPanelVisible) => {
        const html = render(initialPanelVisible);

        expect(elementById(html, "js-properties-panel")).toEqual({
            class: "properties-panel-parent",
            id: "js-properties-panel",
        });
        expect(elementById(html, "js-panel-resizer").class).toBe("panel-resizer");
    });

    // Collapsed in the markup, so the panel cannot flash open before the bundle applies its state.
    it("renders the panel and its resizer collapsed when the host hides it", () => {
        const html = render(false);

        expect(elementById(html, "js-properties-panel")).toEqual({
            class: "properties-panel-parent collapsed",
            id: "js-properties-panel",
            style: "width: 0",
        });
        expect(elementById(html, "js-panel-resizer").class).toBe("panel-resizer collapsed");
    });
});

describe("formEditorHtml", () => {
    it("pins the policy the form editor and its HTTPS form components need", () => {
        const html = renderForm();

        expect(Object.fromEntries(contentSecurityPolicyOf(html))).toEqual({
            "default-src": "'none'",
            "img-src": "webview-csp: data: blob: https:",
            "font-src": "webview-csp: data:",
            "style-src": "webview-csp: 'unsafe-inline'",
            "script-src": `'nonce-${scriptNonceOf(html)}'`,
            "connect-src": "https:",
            "frame-src": "https:",
            "object-src": "blob:",
        });
    });

    it("loads the form stylesheet and runs only its nonced entry script", () => {
        const html = renderForm();

        expect(stylesheetsOf(html)).toEqual(["webview:extension/form-webview/styles.css"]);
        expect(tagsOf(html, "script")).toEqual([
            { nonce: scriptNonceOf(html), src: "webview:extension/form-webview/index.js" },
        ]);
    });

    it("gives the bundle a single app root to render into", () => {
        expect(tagsOf(renderForm(), "div")).toEqual([{ id: "app" }]);
    });
});

describe.each([
    ["bpmnEditorUi", renderBpmn],
    ["dmnModelerHtml", renderDmn],
    ["formEditorHtml", renderForm],
])("%s nonce", (_shell, render) => {
    it("issues a fresh nonce per render", () => {
        const nonces = [scriptNonceOf(render()), scriptNonceOf(render())];

        expect(nonces[0]).not.toBe(nonces[1]);
    });

    it("allows the entry script by the same nonce it carries", () => {
        const html = render();

        expect(tagsOf(html, "script").map((script) => script.nonce)).toEqual([scriptNonceOf(html)]);
    });
});
