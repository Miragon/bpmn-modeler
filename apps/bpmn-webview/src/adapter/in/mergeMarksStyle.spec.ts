import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MERGE_MARKER_CLASSES, type MergeMarker } from "@miragon/bpmn-modeler-types";

import { FLOW_BADGE_RADIUS } from "../../domain/mergeFlowBadgePlace";

// Not `new URL("./…", import.meta.url)`: Vite turns that into a served asset URL.
const sheet = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "mergeMarks.css"), "utf8");

/** The declarations of every rule whose selector names `selectorPart`. */
function declarationsFor(selectorPart: string, dark: boolean): string {
    return [...sheet.matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter(([, selector]) =>
            selector
                .split(",")
                .some(
                    (part) =>
                        part.includes(selectorPart) &&
                        part.includes('[data-bpmn-theme="dark"] ') === dark,
                ),
        )
        .map(([, , body]) => body)
        .join("\n");
}

// A cue no colour carries: a heavier line, a hatch or dashes.
const NON_COLOUR_CUE: Record<MergeMarker, RegExp> = {
    takenFromThisSide: /stroke-width:\s*3px/,
    takenFromOtherSide: /fill:\s*url\(#merge-hatch\)/,
    conflict: /stroke-dasharray:\s*8 4/,
};

describe("mergeMarks.css", () => {
    it.each(Object.entries(MERGE_MARKER_CLASSES) as [MergeMarker, string][])(
        "gives %s a cue that is no colour and a stroke of its own in the dark theme",
        (marker, markerClass) => {
            expect(declarationsFor(`.djs-shape.${markerClass}`, false)).toMatch(
                NON_COLOUR_CUE[marker],
            );
            expect(declarationsFor(`.djs-shape.${markerClass}`, true)).toMatch(/stroke:\s*#/);
        },
    );

    it("styles the conflict badge in both themes", () => {
        expect(declarationsFor(".merge-conflict-badge", false)).toMatch(/background:/);
        expect(declarationsFor(".merge-conflict-badge", true)).toMatch(/background:/);
    });

    it("tells a pick kept here from one replaced here in both themes, by fill, not only colour", () => {
        for (const dark of [false, true]) {
            expect(declarationsFor(".merge-pick-badge--kept-here", dark)).toMatch(/background:/);
            expect(declarationsFor(".merge-pick-badge--replaced-here", dark)).toMatch(
                /background:/,
            );
        }
        expect(declarationsFor(".merge-pick-badge--with-contents::after", false)).toMatch(
            /border:/,
        );
    });

    it("keeps the hatch behind the label with a halo of its ground, in both themes", () => {
        const label = ".djs-shape.merge-taken-from-other-side .djs-visual text";
        const ground = declarationsFor(".merge-hatch__ground", false).match(/fill:\s*(#\w+)/)?.[1];

        expect(declarationsFor(label, false)).toMatch(/paint-order:\s*stroke/);
        expect(declarationsFor(label, false)).toContain(`stroke: ${ground}`);
        expect(declarationsFor(label, true)).toMatch(/stroke:\s*var\(--canvas-fill-color/);
    });

    it("lets the pointer through the badges' overlay boxes to the shapes below", () => {
        for (const overlay of [".djs-overlay-merge-pick", ".djs-overlay-merge-conflict-badge"]) {
            expect(declarationsFor(overlay, false)).toMatch(/pointer-events:\s*none/);
        }
    });

    it("lifts a shape's badge above its anchor, off the shape's type icon", () => {
        expect(declarationsFor(".merge-pick-badge--on-shape", false)).toMatch(
            /transform:\s*translateY\(-100%\)/,
        );
    });

    it("centres a flow's check on its anchor, as round as the clearance flowBadgePlace keeps", () => {
        const onFlow = declarationsFor(".merge-pick-badge--on-flow", false);

        expect(onFlow).toMatch(/transform:\s*translate\(-50%,\s*-50%\)/);
        expect(onFlow).toMatch(new RegExp(`(^|[^-])width:\\s*${FLOW_BADGE_RADIUS * 2}px`));
        expect(onFlow).toMatch(new RegExp(`(^|[^-])height:\\s*${FLOW_BADGE_RADIUS * 2}px`));
    });

    it("outlines a pick's consequence dotted, a cue no theme changes", () => {
        expect(declarationsFor(".djs-shape.merge-consequence", false)).toMatch(
            /stroke-dasharray:\s*2 3/,
        );
    });
});
