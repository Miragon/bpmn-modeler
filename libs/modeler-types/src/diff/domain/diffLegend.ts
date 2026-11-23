import type { DiffCategory } from "./diff";
import type { Translate } from "../../surface/domain/translate";

/** The chevrons of the legend's Previous and Next buttons, on its icons' 24 × 24 grid. */
export const DIFF_LEGEND_CHEVRONS = {
    previous: "m15 18-6-6 6-6",
    next: "m9 18 6-6-6-6",
} as const;

/** One SVG shape of a legend icon: its tag and its attributes on the 24 × 24 grid. */
export type DiffLegendIconShape = readonly [
    tag: "path" | "circle",
    attributes: Readonly<Record<string, string>>,
];

/** The translator the legend renders its words with, such as `@miragon/bpmn-modeler-i18n`'s `i18n`. */
export interface DiffLegendTranslator {
    translate: Translate;
    /** Calls `listener` when the language changes; returns the unsubscribe. */
    onChange(listener: () => void): () => void;
}

export interface DiffLegendActions {
    readonly onPrevious: () => void;
    readonly onNext: () => void;
    /** Without it the legend never shows the swap button. */
    readonly onSwap?: () => void;
    /** Without it the legend never shows Show all. */
    readonly onShowAll?: () => void;
}

/** One count slot: what it counts, the i18n key of its label and its swatch's class modifier. */
export interface DiffLegendSlot<Key extends string = DiffCategory> {
    readonly key: Key;
    readonly label: string;
    readonly modifier: string;
}

/** What one diff legend shows. */
export interface DiffLegendState<Key extends string = DiffCategory> {
    /** One count per slot; omitted when `status` names the open view's single change. */
    readonly counts?: Readonly<Record<Key, number>>;
    readonly status?: Key;
    /** Shown above the counts on compare-files panes, where the tab names both files. */
    readonly filename?: string;
    readonly showSwap: boolean;
    readonly canStep: boolean;
    /** `false` leaves the changes to a partner pane's bar, as the right half of a bar split across two panes. */
    readonly showChanges?: boolean;
    /** `false` leaves stepping, Show all and swap to a partner pane's bar, as the left half of a split bar. */
    readonly showControls?: boolean;
    /** The change the stepper is on, counted from 0; omitted before the first step. */
    readonly position?: { readonly index: number; readonly total: number };
}
