import type { DiffLegendTranslator } from "./diffLegendView";
import { DIFF_SIDE_TEXTS } from "./diffVocabulary";
import { createElement } from "./dom";

/**
 * The label in a diff pane's top left corner, styled with the legend by
 * `diffLegend.css`: which version the pane shows, or the file's name on a pane
 * that compares two files. Re-renders its words when the language changes.
 */
export class DiffSideLabelView {
    // `diff-legend-theme` lends it the bar's font and colours.
    readonly element = createElement("span", "diff-side-label diff-legend-theme");

    private filename: string | undefined;

    private readonly stopTranslating: () => void;

    constructor(
        parent: HTMLElement,
        private readonly side: keyof typeof DIFF_SIDE_TEXTS,
        private readonly translator: DiffLegendTranslator,
    ) {
        parent.append(this.element);
        this.render();
        this.stopTranslating = translator.onChange(() => this.render());
    }

    /** Names the file instead of the side; `undefined` names the side again. */
    showFilename(filename: string | undefined): void {
        this.filename = filename;
        this.render();
    }

    destroy(): void {
        this.stopTranslating();
        this.element.remove();
    }

    private render(): void {
        this.element.textContent =
            this.filename ?? this.translator.translate(DIFF_SIDE_TEXTS[this.side]);
    }
}
