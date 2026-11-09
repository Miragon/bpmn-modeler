import { commands } from "vscode";

import { AddOnsFeature, AddOnViewRevealPort } from "@miragon/bpmn-modeler-core";
import { ADD_ONS_VIEW_ID } from "../../domain/addOnsViewIds";

/**
 * Opens the Artifacts view at the rows Review… leaves to it. Built before the
 * BPMN editor whose reviews use it, and connected once the catalog exists.
 */
export class VsCodeAddOnsViewReveal implements AddOnViewRevealPort {
    private addOns: Pick<AddOnsFeature, "reveal"> | undefined;

    connect(addOns: Pick<AddOnsFeature, "reveal">): void {
        this.addOns = addOns;
    }

    async reveal(addOnIds: readonly string[]): Promise<boolean> {
        if (this.addOns === undefined) return false;
        try {
            // Opens the container and resolves the view, which attaches its panel.
            await commands.executeCommand(`${ADD_ONS_VIEW_ID}.focus`);
        } catch {
            return false;
        }
        this.addOns.reveal(addOnIds);
        return true;
    }
}
