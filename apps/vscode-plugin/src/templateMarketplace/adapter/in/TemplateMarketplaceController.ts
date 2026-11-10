import { commands, ExtensionContext } from "vscode";

import {
    MarketplaceCommandPorts,
    MarketplaceCommands,
    NotifierPort,
} from "@miragon/bpmn-modeler-core";

/** The notifier plus VS Code's error toast that offers to reload the window. */
export interface ReloadingNotifier extends NotifierPort {
    showErrorWithReload(message: string): Promise<void>;
}

export const ADD_MARKETPLACE_CMD = "bpmn-modeler.addMarketplace";
export const UPDATE_MARKETPLACES_CMD = "bpmn-modeler.updateMarketplaces";
export const REMOVE_MARKETPLACE_CMD = "bpmn-modeler.removeMarketplace";

/**
 * Registers the marketplace commands; the core's {@link MarketplaceCommands}
 * run the flows and word every text but the reload hint, which is VS Code's.
 */
export class TemplateMarketplaceController {
    private readonly marketplaces: MarketplaceCommands;

    constructor(
        ports: Omit<MarketplaceCommandPorts, "notifier" | "explainAddFailure">,
        private readonly notifier: ReloadingNotifier,
    ) {
        this.marketplaces = new MarketplaceCommands({
            ...ports,
            notifier,
            explainAddFailure: (error) => this.explainAddFailure(error),
        });
    }

    register(context: Pick<ExtensionContext, "subscriptions">): void {
        context.subscriptions.push(
            commands.registerCommand(ADD_MARKETPLACE_CMD, () => this.marketplaces.add()),
            commands.registerCommand(UPDATE_MARKETPLACES_CMD, () => this.marketplaces.update()),
            commands.registerCommand(REMOVE_MARKETPLACE_CMD, () => this.marketplaces.remove()),
        );
    }

    /** Fire and forget: the core's flow queues behind the commands and never throws. */
    refreshOnStartup(): Promise<void> {
        return this.marketplaces.refreshStale();
    }

    /**
     * A `marketplaces` key added by an in-place update from ≤1.3.x only enters
     * the window's configuration registry on reload; until then the settings
     * write fails, and a reload is the one fix that works.
     */
    private async explainAddFailure(error: Error): Promise<boolean> {
        if (!(error.message ?? "").includes("not a registered configuration")) return false;
        await this.notifier.showErrorWithReload(
            "The BPMN Modeler extension was just updated. Reload the window to " +
                "finish enabling marketplaces, then add it again.",
        );
        return true;
    }
}
