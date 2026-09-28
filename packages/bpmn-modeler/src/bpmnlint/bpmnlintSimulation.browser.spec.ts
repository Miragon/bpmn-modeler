import { afterEach, describe, expect, it } from "vitest";

import "./bpmnlint.css";

let bjsContainer: HTMLElement | undefined;

function mountLintChrome(lintStateClass: string, chromeClass: string): HTMLElement {
    bjsContainer = document.createElement("div");
    bjsContainer.className = "bjs-container";
    const djsContainer = document.createElement("div");
    djsContainer.className = `djs-container ${lintStateClass}`;
    const lintChrome = document.createElement("div");
    lintChrome.className = chromeClass;
    djsContainer.appendChild(lintChrome);
    bjsContainer.appendChild(djsContainer);
    document.body.appendChild(bjsContainer);
    return lintChrome;
}

afterEach(() => {
    bjsContainer?.remove();
    bjsContainer = undefined;
});

describe("lint chrome during token simulation", () => {
    it.each([
        ["bpmnlint-active", "lint-toolbar"],
        ["bpmnlint-disabled", "lint-disabled-chip"],
    ])(
        "hides .%s .%s so the simulation speed control stays reachable",
        (lintStateClass, chromeClass) => {
            const lintChrome = mountLintChrome(lintStateClass, chromeClass);
            expect(getComputedStyle(lintChrome).display).toBe("flex");

            bjsContainer?.classList.add("simulation");
            expect(getComputedStyle(lintChrome).display).toBe("none");

            bjsContainer?.classList.remove("simulation");
            expect(getComputedStyle(lintChrome).display).toBe("flex");
        },
    );
});
