import { afterEach, describe, expect, it, vi } from "vitest";

import { diffSideOf, readPreviewMode } from "./previewMode";

describe("readPreviewMode", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        ["", "modeler"],
        ["?mode=modeler", "modeler"],
        ["?mode=diff-before", "diff-before"],
        ["?mode=diff-after", "diff-after"],
    ])("reads %j as the %s mode", (search, mode) => {
        expect(readPreviewMode(search)).toBe(mode);
    });

    it("falls back to the modeler and names the known modes for an unknown one", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(readPreviewMode("?mode=diff-befor")).toBe("modeler");
        expect(warn).toHaveBeenCalledWith(
            '[dev] Unknown ?mode=diff-befor; falling back to "modeler". Known values: modeler, diff-before, diff-after.',
        );
    });

    it("stays quiet without a mode", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        readPreviewMode("?mode=");

        expect(warn).not.toHaveBeenCalled();
    });
});

describe("diffSideOf", () => {
    it.each([
        ["modeler", undefined],
        ["diff-before", "before"],
        ["diff-after", "after"],
    ] as const)("opens the %s mode on the %s side", (mode, side) => {
        expect(diffSideOf(mode)).toBe(side);
    });
});
