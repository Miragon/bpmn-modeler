/**
 * Per-modeler correction for diagram-js's palette collapse threshold.
 *
 * The Problems bar reduces the canvas by 31px and exposed that diagram-js
 * counts every palette descriptor as a 46px tool, although a separator renders
 * at 16px. With the current 15 tools and one separator, the vendor threshold is
 * 786px while the rendered palette only needs 756px. The corrected calculation
 * still switches to two columns whenever the one-column palette no longer fits.
 *
 * This module replaces the predicate on each injected C7/C8 palette instance;
 * it does not mutate Palette.prototype or affect DMN/viewer canvases. Applying
 * the accurate calculation consistently also avoids changing palette geometry
 * merely because linting is configured. `_needsCollapse` is not in diagram-js's
 * public types, but its implementation explicitly directs style implementors to
 * override it and exposes no public sizing hook. The runtime guard and contract
 * test make dependency drift visible without preventing modeler startup.
 *
 * The constants mirror the pinned diagram-js palette CSS and must be checked
 * whenever that dependency or its palette styles change.
 */
interface PaletteEntry {
    readonly separator?: boolean;
}

type PaletteEntries = Record<string, PaletteEntry>;

interface Palette {
    _needsCollapse?: (availableHeight: number, entries: PaletteEntries) => boolean;
}

const ENTRY_HEIGHT = 46;
const SEPARATOR_HEIGHT = 16;
const VERTICAL_MARGIN = 50;

/** Matches diagram-js's palette sizing while accounting for separators. */
export function needsPaletteCollapse(availableHeight: number, entries: PaletteEntries): boolean {
    const entriesHeight = Object.values(entries).reduce(
        (height, entry) => height + (entry.separator ? SEPARATOR_HEIGHT : ENTRY_HEIGHT),
        0,
    );
    return availableHeight < entriesHeight + VERTICAL_MARGIN;
}

/** Applies the corrected calculation to one palette instance before diagram init. */
export class PaletteLayoutFix {
    static $inject = ["palette"];

    constructor(palette: Palette) {
        if (typeof palette._needsCollapse !== "function") {
            console.warn("[bpmn-modeler] Unable to apply the palette layout correction.");
            return;
        }
        palette._needsCollapse = needsPaletteCollapse;
    }
}

export const PaletteLayoutFixModule = {
    __init__: ["paletteLayoutFix"],
    paletteLayoutFix: ["type", PaletteLayoutFix],
};
