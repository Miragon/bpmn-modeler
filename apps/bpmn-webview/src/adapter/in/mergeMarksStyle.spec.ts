import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MERGE_MARKER_CLASSES, type MergeMarker } from "@miragon/bpmn-modeler-types";

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
});
