import { homedir } from "node:os";
import { join } from "node:path";

import { commands, ExtensionContext, QuickPickItem, window, workspace } from "vscode";

import {
    expandHomePath,
    MarketplaceCommands,
    marketplaceEntryLabel,
    MarketplaceSettingsEntry,
    MarketplaceTemplates,
    NotifierPort,
    parseMarketplaceUrl,
    TemplateMarketplaceService,
} from "@miragon/bpmn-modeler-core";

type SettingsScope = "user" | "workspace";

/** The notifier plus VS Code's error toast that offers to reload the window. */
export interface ReloadingNotifier extends NotifierPort {
    showErrorWithReload(message: string): Promise<void>;
}

/** Where VS Code keeps the marketplace registrations, per settings scope. */
export interface MarketplaceRegistrations {
    getMarketplacesWithScopes(): { entry: MarketplaceSettingsEntry; scopes: SettingsScope[] }[];
    addMarketplace(location: string, scope: SettingsScope): Promise<void>;
    removeMarketplaces(entries: readonly MarketplaceSettingsEntry[]): Promise<void>;
}

export const ADD_MARKETPLACE_CMD = "bpmn-modeler.addMarketplace";
export const UPDATE_MARKETPLACES_CMD = "bpmn-modeler.updateMarketplaces";
export const REMOVE_MARKETPLACE_CMD = "bpmn-modeler.removeMarketplace";

/**
 * Renders a marketplace's scope membership for the Remove picker's description,
 * so the user sees where each entry lives before removing it from every scope.
 */
function describeScopes(scopes: readonly ("user" | "workspace")[]): string {
    const inUser = scopes.includes("user");
    const inWorkspace = scopes.includes("workspace");
    if (inUser && inWorkspace) {
        return "User and Workspace settings";
    }
    return inUser ? "User settings" : "Workspace settings";
}

/**
 * Host glue for the marketplace commands: owns the `vscode` input box, quick
 * picks, and command registration, and persists registrations in the VS Code
 * settings. The flows themselves are the host-agnostic {@link MarketplaceCommands}.
 */
export class TemplateMarketplaceController {
    private readonly marketplaces: MarketplaceCommands;

    constructor(
        marketplaceSvc: TemplateMarketplaceService,
        templates: MarketplaceTemplates,
        private readonly settings: MarketplaceRegistrations,
        private readonly notifier: ReloadingNotifier,
    ) {
        this.marketplaces = new MarketplaceCommands(
            marketplaceSvc,
            templates,
            notifier,
            homedir(),
            (error) => this.explainAddFailure(error),
        );
    }

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(ADD_MARKETPLACE_CMD, () => this.addMarketplace()),
            commands.registerCommand(UPDATE_MARKETPLACES_CMD, () => this.updateMarketplaces()),
            commands.registerCommand(REMOVE_MARKETPLACE_CMD, () => this.removeMarketplace()),
        );
    }

    /**
     * Persists the registration only after the fetch succeeds, so a location
     * whose `marketplace.json` is missing never lands in settings.
     */
    private async addMarketplace(): Promise<void> {
        this.notifier.logInfo("Add Marketplace command invoked");
        const input = await window.showInputBox({
            title: "Add Marketplace",
            prompt: "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
            placeHolder: "https://github.com/owner/repo  or  ~/path/to/folder",
            // Reuse the domain parser as the validator so the accepted forms
            // can never drift from what the service resolves.
            validateInput: (value) => {
                try {
                    parseMarketplaceUrl(expandHomePath(value.trim(), homedir(), join));
                    return undefined;
                } catch {
                    return (
                        "Enter a GitHub or GitLab repository URL, or a local folder path, " +
                        "holding a marketplace.json. Self-hosted hosts go in settings.json."
                    );
                }
            },
        });
        if (!input) {
            this.notifier.logDebug("Add Marketplace cancelled at input box");
            return;
        }

        const scope = await this.pickScope();
        if (!scope) {
            this.notifier.logDebug("Add Marketplace cancelled at scope pick");
            return;
        }

        await this.marketplaces.add(input, (location) =>
            this.settings.addMarketplace(location, scope),
        );
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

    /**
     * Asks where the registration should live. Scope is either/or, so a
     * single-select quick pick fits (an input box can't host a checkbox). Skipped
     * entirely when no workspace is open — only User scope is writable then, so
     * there is nothing to choose. `undefined` means the user dismissed the pick.
     */
    private async pickScope(): Promise<"workspace" | "user" | undefined> {
        if (workspace.workspaceFolders === undefined && workspace.workspaceFile === undefined) {
            return "user";
        }
        // Workspace first so it is the pre-selected default: the Add command is a
        // per-project concern unless the user opts to share it across projects.
        const items: (QuickPickItem & { scope: "workspace" | "user" })[] = [
            {
                label: "This workspace",
                description: "Saved in .vscode/settings.json",
                scope: "workspace",
            },
            {
                label: "All my projects",
                description: "Saved in your user settings",
                scope: "user",
            },
        ];
        const picked = await window.showQuickPick(items, { title: "Add Marketplace" });
        return picked?.scope;
    }

    private async updateMarketplaces(): Promise<void> {
        await this.marketplaces.update();
    }

    /**
     * Unregisters one or more marketplaces via a multi-select quick pick. The
     * pick's OK is the confirmation (re-adding is cheap), so there is no extra
     * dialog.
     */
    private async removeMarketplace(): Promise<void> {
        this.notifier.logInfo("Remove Marketplace command invoked");
        const registered = this.settings.getMarketplacesWithScopes();
        if (registered.length === 0) {
            this.notifier.showInfo("No marketplaces registered.");
            return;
        }

        const items: (QuickPickItem & { entry: MarketplaceSettingsEntry })[] = registered.map(
            ({ entry, scopes }) => ({
                label: marketplaceEntryLabel(entry),
                description: describeScopes(scopes),
                entry,
            }),
        );
        const picked = await window.showQuickPick(items, {
            title: "Remove Marketplace",
            canPickMany: true,
            placeHolder: "Select marketplaces to remove",
        });
        // Escape (`undefined`) and OK with nothing checked (`[]`) both mean cancel.
        if (!picked || picked.length === 0) {
            this.notifier.logDebug("Remove Marketplace cancelled");
            return;
        }

        await this.marketplaces.remove(picked.length, () =>
            this.settings.removeMarketplaces(picked.map((item) => item.entry)),
        );
    }
}
