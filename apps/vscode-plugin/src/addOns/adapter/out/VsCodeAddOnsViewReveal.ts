import { AddOnsFeature, AddOnViewRevealPort } from "@miragon/bpmn-modeler-core";

/** Shows and focuses the Artifacts view; rejects when the host cannot. */
export interface AddOnsViewFocus {
    focus(): Promise<void>;
}

/**
 * Opens the Artifacts view at the rows Review… leaves to it. Built before the
 * BPMN editor whose reviews use it, and connected once the catalog and the
 * view exist.
 */
export class VsCodeAddOnsViewReveal implements AddOnViewRevealPort {
    private connection:
        | { readonly addOns: Pick<AddOnsFeature, "reveal">; readonly view: AddOnsViewFocus }
        | undefined;

    connect(addOns: Pick<AddOnsFeature, "reveal">, view: AddOnsViewFocus): void {
        this.connection = { addOns, view };
    }

    async reveal(addOnIds: readonly string[]): Promise<boolean> {
        if (this.connection === undefined) return false;
        try {
            await this.connection.view.focus();
        } catch {
            return false;
        }
        this.connection.addOns.reveal(addOnIds);
        return true;
    }
}
