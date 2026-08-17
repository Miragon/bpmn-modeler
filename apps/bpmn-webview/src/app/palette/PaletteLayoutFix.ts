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

/**
 * Matches diagram-js's palette sizing but accounts for the shorter separator.
 *
 * The vendor heuristic treats every descriptor as a 46px tool. Separators only
 * occupy 16px, which otherwise makes the palette switch to two columns while
 * the full one-column layout still fits.
 */
export function needsPaletteCollapse(availableHeight: number, entries: PaletteEntries): boolean {
    const entriesHeight = Object.values(entries).reduce(
        (height, entry) => height + (entry.separator ? SEPARATOR_HEIGHT : ENTRY_HEIGHT),
        0,
    );
    return availableHeight < entriesHeight + VERTICAL_MARGIN;
}

/** Applies the corrected calculation to the palette instance before diagram init. */
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
