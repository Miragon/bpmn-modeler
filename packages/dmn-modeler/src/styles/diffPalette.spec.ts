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

function bpmnStroke(kind: string): string | undefined {
    return new RegExp(
        `\\.djs-element\\.diff-${kind} \\.djs-visual > :nth-child\\(1\\) \\{\\s*stroke: (#[0-9a-f]+)`,
        "i",
    ).exec(bpmnCss)?.[1];
}

describe("the DMN diff palette", () => {
    it.each(["added", "removed", "changed"])("marks %s like the BPMN diff", (kind) => {
        expect(dmnColor(kind)).toBeDefined();
        expect(dmnColor(kind)).toBe(bpmnStroke(kind));
    });

    it("outlines the current change and draws moved rules like the BPMN diff", () => {
        expect(dmnColor("current")).toBe(
            /\.diff-selected \.djs-visual \{\s*filter: drop-shadow\(0 0 6px (#[0-9a-f]+)\)/i.exec(
                bpmnCss,
            )?.[1],
        );
        expect(dmnColor("moved")).toBeDefined();
        expect(dmnColor("moved")).toBe(legendColor("moved"));
    });

    it.each(["added", "removed", "changed"])(
        "gives the legend's %s swatch the marker's colour",
        (kind) => {
            expect(legendColor(kind)).toBeDefined();
            expect(legendColor(kind)).toBe(bpmnStroke(kind));
        },
    );
});

describe("the shared diff legend's stylesheet", () => {
    it("gives both legends the Miragon look: Geist, the blue Next button and its radii", () => {
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
