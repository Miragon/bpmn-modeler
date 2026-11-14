import { i18n } from "@miragon/bpmn-modeler-i18n";
import { DiffSideLabelView } from "@miragon/bpmn-modeler-types";

/**
 * The label in a diff pane's top left corner: which version the pane shows,
 * or the file's name on a pane that compares two files. Speaks the shared
 * {@link i18n} translator's language.
 */
export class DiffSideLabel {
    private readonly view: DiffSideLabelView;

    constructor(parent: HTMLElement, side: "before" | "after") {
        this.view = new DiffSideLabelView(parent, side, i18n);
    }

    /** Names the file instead of the side; `undefined` names the side again. */
    showFilename(filename: string | undefined): void {
        this.view.showFilename(filename);
    }

    /** Adds "Not in this version" while the pane's version lacks the plane its partner entered. */
    showPlaneMissing(missing: boolean): void {
        this.view.showPlaneMissing(missing);
    }

    destroy(): void {
        this.view.destroy();
    }
}
