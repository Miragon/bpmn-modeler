import { i18n } from "@miragon/bpmn-modeler-i18n";
import { DIFF_SIDE_TEXTS } from "@miragon/bpmn-modeler-types";

/**
 * The label in a diff pane's top left corner: which version the pane shows,
 * or the file's name on a pane that compares two files. Re-renders its words
 * when the language changes.
 */
export class DiffSideLabel {
    private readonly element = document.createElement("span");

    private filename: string | undefined;

    private readonly stopTranslating: () => void;

    constructor(
        parent: HTMLElement,
        private readonly side: "before" | "after",
    ) {
        // `diff-legend-theme` lends it the bar's font and colours.
        this.element.className = "diff-side-label diff-legend-theme";
        parent.append(this.element);
        this.render();
        this.stopTranslating = i18n.onChange(() => this.render());
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
        this.element.textContent = this.filename ?? i18n.translate(DIFF_SIDE_TEXTS[this.side]);
    }
}
