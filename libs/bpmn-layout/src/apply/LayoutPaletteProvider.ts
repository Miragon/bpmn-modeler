import type { Layouter } from "./Layouter";

interface PaletteLike {
    registerProvider(provider: unknown): void;
}

interface InjectorLike {
    get<T>(name: string, strict: false): T | null;
}

type Translate = (template: string) => string;

interface PaletteEntry {
    group?: string;
    html?: string;
    title?: string;
    separator?: boolean;
    action?: { click: () => void };
}

type PaletteEntries = Record<string, PaletteEntry>;

/**
 * The stock bpmn-js tool the entry is placed after. bpmn-js closes its `tools`
 * group with a `tool-separator`, and a plainly-returned entry is appended
 * *after* it — which renders below the divider, reading as one of the element
 * creation tools rather than as a tool.
 */
const ANCHOR = "global-connect-tool";

/**
 * A small orthogonal flow graph — one node branching into two — drawn in
 * `currentColor` so it inherits the palette's light/dark foreground, matching
 * the context-pad icons the other libs ship.
 *
 * Purpose-drawn rather than borrowed from the bpmn icon font: the font's
 * closest glyph is a wrench, which in a palette reads as "settings" rather
 * than "arrange".
 *
 * Stroke width 1.5 rather than the 2 the shape wants on its own — at the
 * palette's 22px the hand, lasso and connect tools next to it are thin line
 * art, and a heavier icon reads as the odd one out. Filled nodes were tried
 * and rejected for the same reason: far too dark beside those neighbours.
 */
const FORMAT_ICON_SVG =
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" ` +
    `xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="2" y="9" width="5" height="6" rx="1"/>` +
    `<rect x="17" y="3" width="5" height="5" rx="1"/>` +
    `<rect x="17" y="16" width="5" height="5" rx="1"/>` +
    `<path d="M7 12h4"/><path d="M11 12V5.5h6"/><path d="M11 12v6.5h6"/>` +
    `</svg>`;

/**
 * The palette centres its font-icon entries by line height, which leaves an
 * inline SVG sitting on the text baseline — so this one centres itself.
 * `draggable="false"` because the entry is a click action, not a create tool
 * to drag onto the canvas.
 */
const FORMAT_ICON_HTML =
    `<div class="entry" draggable="false" ` +
    `style="display:flex;align-items:center;justify-content:center;">${FORMAT_ICON_SVG}</div>`;

/**
 * Puts "Format diagram" in the palette's tool group, next to the hand and lasso
 * tools.
 *
 * The tool group rather than the element groups below it: this acts on the
 * whole diagram, it does not create anything. A palette entry is the only
 * mouse-reachable trigger inside the canvas — a context-pad entry would be
 * wrong, since the pad acts on the element it is attached to.
 */
export class LayoutPaletteProvider {
    static $inject = ["palette", "translate", "injector"];

    constructor(
        palette: PaletteLike,
        private readonly translate: Translate,
        private readonly injector: InjectorLike,
    ) {
        // Same reason as the keyboard binding: `Layouter` needs `modeling` and
        // `commandStack`, so it is resolved on click, not at construction.
        if (!this.injector.get("commandStack", false)) return;

        palette.registerProvider(this);
    }

    /**
     * Returns an updater rather than a plain entry map so the entry can be
     * placed *inside* the tool group instead of after its trailing separator.
     * diagram-js hands a function-returning provider the accumulated entries
     * and takes its result as the new map.
     */
    getPaletteEntries(): (entries: PaletteEntries) => PaletteEntries {
        const entry: PaletteEntry = {
            group: "tools",
            html: FORMAT_ICON_HTML,
            title: this.translate("Format diagram"),
            action: {
                click: () => {
                    const layouter = this.injector.get<Layouter>("bpmnLayouter", false);
                    // Reported through `layout.formatted` on the event bus, so
                    // nothing is awaited here.
                    if (layouter) void layouter.format();
                },
            },
        };

        return (entries) => {
            const ids = Object.keys(entries);
            const at = ids.indexOf(ANCHOR);
            // No anchor (a palette without the connect tool) — append and let it
            // land wherever its group does.
            if (at < 0) return { ...entries, "format-diagram": entry };

            const reordered: PaletteEntries = {};
            ids.forEach((id, index) => {
                reordered[id] = entries[id];
                if (index === at) reordered["format-diagram"] = entry;
            });
            return reordered;
        };
    }
}
