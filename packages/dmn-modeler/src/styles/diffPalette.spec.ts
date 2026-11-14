import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dmnCss = readFileSync(join(__dirname, "diff.css"), "utf8");
const bpmnCss = readFileSync(
    join(__dirname, "../../../bpmn-modeler/src/styles/diffView.css"),
    "utf8",
);
const legendCss = readFileSync(
    join(__dirname, "../../../../libs/modeler-types/src/diffLegend.css"),
    "utf8",
);

function declarationsOf(selectorList: string): string {
    const start = legendCss.indexOf(`${selectorList} {`);
    expect(start, `no rule for ${selectorList}`).toBeGreaterThanOrEqual(0);
    return legendCss.slice(start, legendCss.indexOf("}", start));
}

function legendColor(name: string): string | undefined {
    return new RegExp(`--diff-legend-${name}: (#[0-9a-f]+);`, "i").exec(legendCss)?.[1];
}

function dmnColor(name: string): string | undefined {
    return new RegExp(`--dmn-diff-${name}: (#[0-9a-f]+);`, "i").exec(dmnCss)?.[1];
}

/** The declarations of the one rule with exactly this selector, whitespace aside. */
function ruleFor(css: string, selector: string): string | undefined {
    const matches = css
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("}")
        .map((rule) => rule.split("{"))
        .filter(([head, body]) => body !== undefined && selectorOf(head!) === selector)
        .map(([, body]) => body!.replace(/\s+/g, " ").trim());
    expect(matches.length, `rules for ${selector}`).toBeLessThanOrEqual(1);
    return matches[0];
}

/** A rule's selector, without an at-rule such as `@import` before it. */
function selectorOf(head: string): string {
    return head.split(";").pop()!.replace(/\s+/g, " ").trim();
}

const SHAPE = (kind: string) => `.djs-shape.diff-${kind} .djs-visual > :nth-child(1)`;
const LIGHT_BPMN_SHAPE = (kind: string) =>
    `.djs-shape.diff-${kind}:not([data-bpmn-theme="dark"] *) .djs-visual > :nth-child(1)`;
const DMN_IN_LIGHT = '.dmn-diff:not([data-dmn-theme="dark"], [data-dmn-theme="dark"] *)';
const DMN_IN_DARK = '.dmn-diff:is([data-dmn-theme="dark"], [data-dmn-theme="dark"] *)';

describe("the DMN diff palette", () => {
    it.each(["added", "removed", "changed", "layout-changed"])(
        "outlines and tints a %s shape like the BPMN diff, in light and dark",
        (kind) => {
            const outline = ruleFor(bpmnCss, SHAPE(kind));
            const lightFill = ruleFor(bpmnCss, LIGHT_BPMN_SHAPE(kind));
            const darkOutline = ruleFor(bpmnCss, `[data-bpmn-theme="dark"] ${SHAPE(kind)}`);

            expect([outline, lightFill, darkOutline]).not.toContain(undefined);
            expect(ruleFor(dmnCss, `.dmn-diff ${SHAPE(kind)}`)).toBe(outline);
            expect(ruleFor(dmnCss, `${DMN_IN_LIGHT} ${SHAPE(kind)}`)).toBe(lightFill);
            expect(ruleFor(dmnCss, `${DMN_IN_DARK} ${SHAPE(kind)}`)).toBe(darkOutline);
        },
    );

    it.each(["added", "removed", "changed", "layout-changed"])(
        "colours a %s requirement in dark mode like a BPMN connection",
        (kind) => {
            const edge = `.djs-connection.diff-${kind} .djs-visual path`;
            const bpmnDark = ruleFor(bpmnCss, `[data-bpmn-theme="dark"] ${edge}`);

            expect(bpmnDark).toBeDefined();
            expect(ruleFor(dmnCss, `${DMN_IN_DARK} ${edge}`)).toBe(bpmnDark);
        },
    );

    it("outlines the current change like the BPMN diff", () => {
        expect(dmnColor("current")).toBe(
            /\.diff-selected \.djs-visual \{\s*filter: drop-shadow\(0 0 6px (#[0-9a-f]+)\)/i.exec(
                bpmnCss,
            )?.[1],
        );
    });

    it.each(["added", "removed", "changed", "moved"])(
        "gives the legend's %s swatch the DMN status colour",
        (kind) => {
            expect(legendColor(kind)).toBeDefined();
            expect(legendColor(kind)).toBe(dmnColor(kind));
        },
    );
});

describe("the shared diff legend's stylesheet", () => {
    it("gives both legends the Miragon look: Geist, the blue primary action and its radii", () => {
        const look = declarationsOf(".diff-legend,\n.diff-legend-theme");

        expect(look).toMatch(/--diff-legend-font-family:\s*"Geist Variable", "Geist",/);
        expect(look).toContain("--diff-legend-primary-surface: #335de5;");
        expect(look).toContain("--diff-legend-radius: 12px;");
        expect(look).toContain("--diff-legend-button-radius: 8px;");
    });

    it("turns dark under the BPMN and the DMN theme attribute alike", () => {
        const dark = declarationsOf(
            '[data-bpmn-theme="dark"] :is(.diff-legend, .diff-legend-theme),\n' +
                '[data-dmn-theme="dark"] :is(.diff-legend, .diff-legend-theme)',
        );

        expect(dark).toContain("--diff-legend-surface:");
    });

    // The theme attributes resolve VS Code's high contrast to dark, so only its body class tells it apart.
    it("paints no fill in VS Code's high contrast and hovers with an outline instead", () => {
        const highContrast = declarationsOf(
            "body.vscode-high-contrast :is(.diff-legend, .diff-legend-theme)",
        );

        expect(highContrast).toContain("--diff-legend-primary-surface: transparent;");
        expect(highContrast).toContain("--diff-legend-primary-hover: transparent;");
        expect(highContrast).toContain("--diff-legend-button-hover: transparent;");
        expect(highContrast).toMatch(/--diff-legend-button-hover-outline: 1px dashed/);
    });

    // The legend hides its parts with the hidden attribute, which any author `display` rule overrides.
    it("hides the legend and every part it marks hidden", () => {
        expect(legendCss).toMatch(
            /\.diff-legend\[hidden\],\s*\.diff-legend \[hidden\]\s*\{\s*display: none;/,
        );
    });
});
