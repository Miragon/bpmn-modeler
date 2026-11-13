// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

const sheet = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const panelChromeCss = sheet("../../../../libs/shared/src/lib/panelChrome.css");
const modeCss = sheet("../../../../packages/bpmn-modeler/src/styles/mode.css");

afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
});

function injectStylesheets(...sheets: string[]): void {
    for (const sheet of sheets) {
        const style = document.createElement("style");
        style.textContent = sheet;
        document.head.append(style);
    }
}

function mountPanelHost(): HTMLElement {
    const page = document.createElement("div");
    page.className = "content with-diagram";
    const panelHost = document.createElement("div");
    panelHost.className = "properties-panel-parent panel-host";
    page.append(panelHost);
    document.body.append(page);
    return panelHost;
}

// A lazily loaded package chunk can land the mode sheet before or after the page's.
describe("the mode strip's panel host on the editor page", () => {
    it.each([
        ["the page sheet before mode.css", [panelChromeCss, modeCss]],
        ["mode.css before the page sheet", [modeCss, panelChromeCss]],
    ])("stays a visible flex column with %s", (_order, sheets) => {
        injectStylesheets(...sheets);

        const computedStyle = getComputedStyle(mountPanelHost());

        expect(computedStyle.display).toBe("flex");
        expect(computedStyle.overflow).toBe("hidden");
    });
});
