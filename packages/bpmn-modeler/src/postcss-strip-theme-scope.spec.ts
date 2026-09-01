import postcss from "postcss";
import { describe, expect, it } from "vitest";

import stripThemeScope from "../scripts/postcss-strip-theme-scope.mjs";

/**
 * The plugin derives the legacy un-scoped `darkTheme.css` from the single
 * `[data-bpmn-theme="dark"]`-scoped source. It must remove every mention of the
 * attribute while preserving the selector's structure, so the split sheet keeps
 * matching the same elements a bare `#theme-link` swap always did.
 */
function strip(css: string): string {
    return postcss([stripThemeScope()]).process(css, { from: undefined }).css;
}

describe("postcss-strip-theme-scope", () => {
    const cases: ReadonlyArray<[name: string, input: string, expected: string]> = [
        [
            "attribute alone → :root",
            `[data-bpmn-theme="dark"] { color: red }`,
            `:root { color: red }`,
        ],
        [
            "descendant compound → :root descendant",
            `[data-bpmn-theme="dark"] .djs-parent { color: red }`,
            `:root .djs-parent { color: red }`,
        ],
        [
            "compounded on :root → :root",
            `:root[data-bpmn-theme="dark"] .panel-resizer { color: red }`,
            `:root .panel-resizer { color: red }`,
        ],
        [
            "compounded on a class → the class alone",
            `.am-overlay-root[data-bpmn-theme="dark"] { color: red }`,
            `.am-overlay-root { color: red }`,
        ],
        [
            "both overlay forms collapse",
            `[data-bpmn-theme="dark"] .etc-overlay-root, .etc-overlay-root[data-bpmn-theme="dark"] { color: red }`,
            `:root .etc-overlay-root, .etc-overlay-root { color: red }`,
        ],
        [
            "child combinator preserved",
            `[data-bpmn-theme="dark"] .djs-popup-header-group > li > button { color: red }`,
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

    it("leaves no data-bpmn-theme in the output", () => {
        const out = strip(
            `[data-bpmn-theme="dark"] .a, :root[data-bpmn-theme="dark"] .b, .c[data-bpmn-theme="dark"] { color: red }`,
        );
        expect(out).not.toContain("data-bpmn-theme");
    });
});
