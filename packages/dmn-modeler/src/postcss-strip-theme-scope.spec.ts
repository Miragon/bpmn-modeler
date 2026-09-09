import postcss from "postcss";
import { describe, expect, it } from "vitest";

import stripThemeScope from "../scripts/postcss-strip-theme-scope.mjs";

function strip(css: string): string {
    return postcss([stripThemeScope()]).process(css, { from: undefined }).css;
}

describe("postcss-strip-theme-scope", () => {
    const cases: ReadonlyArray<[name: string, input: string, expected: string]> = [
        [
            "attribute alone → :root",
            `[data-dmn-theme="dark"] { color: red }`,
            `:root { color: red }`,
        ],
        [
            "descendant compound → :root descendant",
            `[data-dmn-theme="dark"] .djs-parent { color: red }`,
            `:root .djs-parent { color: red }`,
        ],
        [
            "compounded on :root → :root",
            `:root[data-dmn-theme="dark"] body { color: red }`,
            `:root body { color: red }`,
        ],
        [
            "compounded on a class → the class alone",
            `.properties-panel-parent[data-dmn-theme="dark"] { color: red }`,
            `.properties-panel-parent { color: red }`,
        ],
        [
            "both panel-parent forms collapse",
            `.properties-panel-parent[data-dmn-theme="dark"], :root[data-dmn-theme="dark"] .properties-panel-parent { color: red }`,
            `.properties-panel-parent, :root .properties-panel-parent { color: red }`,
        ],
        [
            "child combinator preserved",
            `[data-dmn-theme="dark"] .djs-popup-header-group > li > button { color: red }`,
            `:root .djs-popup-header-group > li > button { color: red }`,
        ],
        [
            "unscoped selector untouched",
            `.djs-container { color: red }`,
            `.djs-container { color: red }`,
        ],
    ];

    it.each(cases)("%s", (_name, input, expected) => {
        expect(strip(input)).toBe(expected);
    });

    it("leaves no data-dmn-theme in the output", () => {
        const out = strip(
            `[data-dmn-theme="dark"] .a, :root[data-dmn-theme="dark"] .b, .c[data-dmn-theme="dark"] { color: red }`,
        );
        expect(out).not.toContain("data-dmn-theme");
    });
});
