import { describe, expect, it } from "vitest";

import { fitPreview, INITIAL_PREVIEW_FIT } from "./previewFit";

const WIDE = 1000;
const NARROW = 400;

describe("fitPreview", () => {
    it("closes the preview when the editor turns narrow", () => {
        expect(fitPreview(INITIAL_PREVIEW_FIT, NARROW, true)).toEqual({
            fit: { narrow: true, closedForRoom: true },
            show: false,
        });
    });

    it("brings it back when the editor widens again", () => {
        const { fit } = fitPreview(INITIAL_PREVIEW_FIT, NARROW, true);

        expect(fitPreview(fit, WIDE, false)).toEqual({
            fit: { narrow: false, closedForRoom: false },
            show: true,
        });
    });

    it("leaves a preview the user closed closed when the editor widens", () => {
        const narrowed = fitPreview(INITIAL_PREVIEW_FIT, NARROW, false);

        expect(narrowed.show).toBeUndefined();
        expect(fitPreview(narrowed.fit, WIDE, false).show).toBeUndefined();
    });

    it("leaves the user's choice alone while the editor stays narrow", () => {
        const { fit } = fitPreview(INITIAL_PREVIEW_FIT, NARROW, true);

        const opened = fitPreview(fit, NARROW - 10, true);

        expect(opened.show).toBeUndefined();
        expect(opened.fit.closedForRoom).toBe(false);
        expect(fitPreview(opened.fit, WIDE, true).show).toBeUndefined();
    });

    it("keeps knowing why it is closed while the editor stays narrow", () => {
        const { fit } = fitPreview(INITIAL_PREVIEW_FIT, NARROW, true);

        const stillClosed = fitPreview(fit, NARROW - 10, false);

        expect(fitPreview(stillClosed.fit, WIDE, false).show).toBe(true);
    });

    it("leaves the user's choice alone while the editor stays wide", () => {
        expect(fitPreview(INITIAL_PREVIEW_FIT, WIDE, false).show).toBeUndefined();
        expect(fitPreview(INITIAL_PREVIEW_FIT, WIDE + 10, true).show).toBeUndefined();
    });
});
