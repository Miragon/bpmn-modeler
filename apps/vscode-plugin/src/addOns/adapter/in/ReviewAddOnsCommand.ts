import { commands, ExtensionContext } from "vscode";

import { AddOnsFeature, LoggerPort } from "@miragon/bpmn-modeler-core";
import type { AddOnsViewProvider } from "./AddOnsViewProvider";

export const REVIEW_ADD_ONS_CMD = "bpmn-modeler.reviewAddOns";

/** The palette's Review Add-ons: shows the Add-ons view, then has the core land it on what needs review. */
export class ReviewAddOnsCommand {
    constructor(
        private readonly view: Pick<AddOnsViewProvider, "focus">,
        private readonly addOns: Pick<AddOnsFeature, "revealNeedsReview">,
        private readonly logger: LoggerPort,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(commands.registerCommand(REVIEW_ADD_ONS_CMD, () => this.run()));
    }

    async run(): Promise<void> {
        try {
            await this.view.focus();
        } catch (error) {
            // Only reachable past the view's `when` clause, e.g. through a keybinding with no folder open.
            this.logger.logWarning(`The Add-ons view did not open: ${String(error)}`);
            return;
        }
        this.addOns.revealNeedsReview();
    }
}
