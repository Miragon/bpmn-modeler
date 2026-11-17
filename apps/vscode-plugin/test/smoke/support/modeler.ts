import { readFile } from "node:fs/promises";

import type { FrameLocator, Locator } from "playwright-core";
import { expect } from "vitest";

/** `Default Light+`/`Dark+` exist in every VS Code down to the engines floor; the `Modern` themes do not. */
export const COLOR_THEMES = [
    {
        id: "light",
        name: "Default Light+",
        workbenchClass: "vs",
        bodyClass: "vscode-light",
        modelerTheme: "light",
        brandMode: { theme: "light", contrast: null },
    },
    {
        id: "dark",
        name: "Default Dark+",
        workbenchClass: "vs-dark",
        bodyClass: "vscode-dark",
        modelerTheme: "dark",
        brandMode: { theme: "dark", contrast: null },
    },
    {
        id: "high-contrast",
        name: "Default High Contrast",
        workbenchClass: "hc-black",
        bodyClass: "vscode-high-contrast",
        modelerTheme: "dark",
        brandMode: { theme: "dark", contrast: "hoch" },
    },
] as const;

export async function diagramRendered(webview: FrameLocator): Promise<boolean> {
    const shapes = await webview.locator(".djs-container .djs-element.djs-shape").count();
    const connections = await webview.locator(".djs-container .djs-element.djs-connection").count();
    return shapes >= 3 && connections >= 2;
}

export async function selectElement(webview: FrameLocator, elementId: string): Promise<void> {
    const shape = webview.locator(`.djs-shape[data-element-id="${elementId}"]`);
    // diagram-js toggles an already selected element off on a second click.
    if (!(await shape.evaluate((node) => node.classList.contains("selected")))) {
        await shape.locator(":scope > .djs-hit").click();
    }
    await expect
        .poll(() => shape.evaluate((node) => node.classList.contains("selected")))
        .toBe(true);
}

/** Repaints after a DOM change, so a screenshot shows the settled frame. */
export async function settle(view: { locator(selector: string): Locator }): Promise<void> {
    await view
        .locator("html")
        .evaluate(
            () =>
                new Promise<void>((done) =>
                    requestAnimationFrame(() => requestAnimationFrame(() => done())),
                ),
        );
}

export async function switchMode(webview: FrameLocator, mode: string): Promise<void> {
    const panelHost = webview.locator("#js-properties-panel");
    await webview.locator(".mode-chip").click();
    await webview.locator(`.mode-menu-item[data-mode="${mode}"]`).click();
    await expect.poll(() => panelHost.getAttribute("data-surface-mode")).toBe(mode);
    await expect.poll(() => panelHost.getAttribute("aria-busy")).toBe("false");
}

/** A poll for zero passes at once, so this watches the whole window for an element that appears late. */
export async function expectAbsentFor(locator: Locator, milliseconds: number): Promise<void> {
    const until = Date.now() + milliseconds;
    while (Date.now() < until) {
        expect(await locator.count()).toBe(0);
        await new Promise((done) => setTimeout(done, 100));
    }
}

export async function jsonInFile(file: string): Promise<Record<string, unknown> | undefined> {
    try {
        return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    } catch {
        // Not written yet, or VS Code is halfway through writing it.
        return undefined;
    }
}

/** Focus inside a webview frame: its document has it and the element is the active one. */
export function isFocused(element: Locator): Promise<boolean> {
    return element
        .evaluate((node) => node === document.activeElement && document.hasFocus())
        .catch(() => false);
}
