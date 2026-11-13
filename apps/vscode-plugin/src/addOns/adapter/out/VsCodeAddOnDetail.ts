import type { AddOnDetailPort, AddOnDetailTarget } from "@miragon/bpmn-modeler-core";

/** Shows an add-on's details in the editor tab, opening it when none is open. */
export interface AddOnDetailTab {
    show(target: AddOnDetailTarget): void;
}

/**
 * Opens an add-on's details in an editor tab. Built before the catalog that
 * calls it, and connected once the tab, which attaches to that catalog, exists.
 */
export class VsCodeAddOnDetail implements AddOnDetailPort {
    private tab?: AddOnDetailTab;

    connect(tab: AddOnDetailTab): void {
        this.tab = tab;
    }

    open(target: AddOnDetailTarget): void {
        this.tab?.show(target);
    }
}
