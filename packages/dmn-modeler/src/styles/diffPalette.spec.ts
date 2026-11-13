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
