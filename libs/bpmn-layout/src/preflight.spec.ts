import { describe, expect, it } from "vitest";

import { analyzeLayoutability } from "./preflight";
import type { PreflightModel } from "./preflight";

function model(over: Partial<PreflightModel> = {}): PreflightModel {
    return { editable: true, elementCount: 5, ...over };
}

describe("analyzeLayoutability", () => {
    it("allows a non-empty, editable surface", () => {
        expect(analyzeLayoutability(model())).toBeUndefined();
    });

    it("refuses a read-only surface", () => {
        expect(analyzeLayoutability(model({ editable: false }))).toBe("UNSUPPORTED_SURFACE");
    });

    it("refuses an empty diagram", () => {
        expect(analyzeLayoutability(model({ elementCount: 0 }))).toBe("EMPTY_DIAGRAM");
    });

    it("reports the surface before anything else — it is the reason nothing else can be checked", () => {
        expect(analyzeLayoutability(model({ editable: false, elementCount: 0 }))).toBe(
            "UNSUPPORTED_SURFACE",
        );
    });
});
