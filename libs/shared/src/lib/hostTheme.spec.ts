// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    applyPageThemeScope,
    createHostThemeAdapter,
    resolveHostThemeKind,
    type HostThemeKind,
} from "./hostTheme";

/**
 * The shared VS Code `<body>`-class theme adapter both webview hosts use. The
 * lib's default vitest env is `node`, so this file opts into jsdom for `document`
 * and `MutationObserver`.
 */

// jsdom delivers MutationObserver callbacks on a microtask; flush them.
const flushObservers = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("resolveHostThemeKind", () => {
    beforeEach(() => {
        document.body.className = "";
        document.documentElement.removeAttribute("data-bpmn-theme");
        document.documentElement.removeAttribute("data-dmn-theme");
    });

    it("resolves dark from vscode-dark", () => {
        document.body.classList.add("vscode-dark");
        expect(resolveHostThemeKind()).toBe("dark");
    });

    it("resolves dark from vscode-high-contrast", () => {
        document.body.classList.add("vscode-high-contrast");
        expect(resolveHostThemeKind()).toBe("dark");
    });

    it("resolves light otherwise", () => {
        document.body.classList.add("vscode-light");
        expect(resolveHostThemeKind()).toBe("light");
    });
});

describe("applyPageThemeScope", () => {
    afterEach(() => {
        document.documentElement.removeAttribute("data-dmn-theme");
    });

    it("sets the given attribute on <html>", () => {
        applyPageThemeScope("data-dmn-theme", "dark");
        expect(document.documentElement.getAttribute("data-dmn-theme")).toBe("dark");
    });
});

describe("createHostThemeAdapter", () => {
    beforeEach(() => {
        document.body.className = "";
    });

    it("engages on the first automatic call and follows a live body-class change", async () => {
        const applied: HostThemeKind[] = [];
        const adapter = createHostThemeAdapter((kind) => applied.push(kind));

        adapter.setMode("automatic");
        expect(applied).toEqual(["light"]);

        document.body.classList.add("vscode-dark");
        await flushObservers();
        expect(applied[applied.length - 1]).toBe("dark");

        adapter.dispose();
    });

    it("a forced mode stops following the body class", async () => {
        const applied: HostThemeKind[] = [];
        const adapter = createHostThemeAdapter((kind) => applied.push(kind));

        adapter.setMode("automatic");
        adapter.setMode("light");
        expect(applied[applied.length - 1]).toBe("light");

        document.body.classList.add("vscode-dark");
        await flushObservers();
        expect(applied[applied.length - 1]).toBe("light");

        adapter.dispose();
    });

    it("dispose disconnects the observer", async () => {
        const apply = vi.fn();
        const adapter = createHostThemeAdapter(apply);

        adapter.setMode("automatic");
        adapter.dispose();
        apply.mockClear();

        document.body.classList.add("vscode-dark");
        await flushObservers();
        expect(apply).not.toHaveBeenCalled();
    });
});
