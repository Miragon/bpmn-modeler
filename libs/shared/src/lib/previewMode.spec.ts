import { afterEach, describe, expect, it, vi } from "vitest";

import { previewModeOf } from "./previewMode";

const MODES = ["editor", "diff-left", "diff-right"] as const;

describe("a browser preview's ?mode=", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it.each([
        ["?mode=editor", "editor"],
        ["?mode=diff-right", "diff-right"],
        ["?theme=dark&mode=diff-left", "diff-left"],
    ])("reads %j as the %s mode", (search, mode) => {
        expect(previewModeOf(search, MODES)).toBe(mode);
    });

    it.each(["", "?mode=", "?theme=dark"])(
        "opens the first mode without a word for %j",
        (search) => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

            expect(previewModeOf(search, MODES)).toBe("editor");
            expect(warn).not.toHaveBeenCalled();
        },
    );

    it("falls back to the first mode and names the known modes for an unknown one", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(previewModeOf("?mode=diff-lef", MODES)).toBe("editor");
        expect(warn).toHaveBeenCalledWith(
            '[dev] Unknown ?mode=diff-lef; falling back to "editor". Known values: editor, diff-left, diff-right.',
        );
    });

    it("leaves an inherited object member unknown", () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);

        expect(previewModeOf("?mode=toString", MODES)).toBe("editor");
    });
});
