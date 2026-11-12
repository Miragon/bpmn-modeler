import { describe, expect, it } from "vitest";

import { DIFF_MARKERS } from "@miragon/bpmn-modeler-types";

import type { DiffMarkerClass } from "./DiffViewer";

const EVERY_MARKER_CLASS: Record<DiffMarkerClass, true> = {
    "diff-added": true,
    "diff-removed": true,
    "diff-changed": true,
    "diff-layout-changed": true,
};

describe("DiffMarkerClass", () => {
    it("names exactly the markers the shared diff vocabulary puts on the canvas", () => {
        expect(Object.keys(EVERY_MARKER_CLASS).sort()).toEqual(Object.values(DIFF_MARKERS).sort());
    });
});
