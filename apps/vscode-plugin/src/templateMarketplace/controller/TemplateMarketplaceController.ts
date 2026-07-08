import { homedir } from "node:os";
import { join } from "node:path";

import { commands, ExtensionContext, QuickPickItem, window, workspace } from "vscode";

import {
    BpmnElementTemplatesService,
    EditorSessionStore,
    marketplaceEntryLabel,
    MarketplaceSettingsEntry,
    parseMarketplaceUrl,
    TemplateMarketplaceService,
} from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { VsCodeSettings } from "../../shared/infrastructure/VsCodeSettings";

export const ADD_MARKETPLACE_CMD = "bpmn-modeler.addMarketplace";
export const UPDATE_MARKETPLACES_CMD = "bpmn-modeler.updateMarketplaces";
export const REMOVE_MARKETPLACE_CMD = "bpmn-modeler.removeMarketplace";

/**
 * Expands a leading `~` at the host boundary — a shell convention neither the
 * filesystem APIs nor the host-agnostic core resolve — so the core only ever
 * sees an absolute path. `~user` is left untouched (not portably resolvable) so
 * the parser rejects it.
 */
export function expandHomePath(input: string): string {
    if (input === "~") {
        return homedir();
    }
    if (input.startsWith("~/") || input.startsWith("~\\")) {
        return join(homedir(), input.slice(2));
    }
    return input;
}

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
 * picks, progress, and command registration, delegating all fetch/cache logic to
 * the host-agnostic {@link TemplateMarketplaceService}. After any add, update, or
 * removal it re-pushes templates to open editors so the change (newly cached
 * templates, or pruned ones) appears without reopening.
 */
export class TemplateMarketplaceController {
    constructor(
        private readonly marketplaceSvc: TemplateMarketplaceService,
        private readonly templatesSvc: BpmnElementTemplatesService,
        private readonly editorStore: EditorSessionStore,
        private readonly settings: VsCodeSettings,
        private readonly notifier: VsCodeNotifier,
    ) {}

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
                    parseMarketplaceUrl(expandHomePath(value.trim()));
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

        // Persist the expanded path so a re-fetch via Update (which re-reads
        // settings) never sees a `~`.
        const location = expandHomePath(input.trim());
        try {
            await this.notifier.withProgress("Adding marketplace…", () =>
                this.marketplaceSvc.addMarketplace(location),
            );
            await this.settings.addMarketplace(location, scope);
            this.notifier.logDebug(`Marketplace registration persisted to settings: ${location}`);
            await this.refreshOpenEditors();
            this.notifier.showInfo("Marketplace added.");
        } catch (error) {
            await this.handleAddFailure(error as Error);
        }
    }

    /**
     * The fetch caches templates *before* the settings write, so a failed
     * persist leaves an orphaned cache entry — prune it first so a failed add
     * leaves no residue. Then, when the write failed because the `marketplaces`
     * key is not yet in the window's configuration registry (an in-place update
     * from ≤1.3.x whose window hasn't reloaded), steer the user to the one fix
     * that works — a window reload — instead of the generic failure toast.
     */
    private async handleAddFailure(error: Error): Promise<void> {
        try {
            await this.marketplaceSvc.pruneOrphanedCaches();
        } catch (pruneError) {
            // A prune failure must not mask the original add failure below.
            this.notifier.logError(pruneError as Error);
        }

        if ((error.message ?? "").includes("not a registered configuration")) {
            await this.notifier.showErrorWithReload(
                "The BPMN Modeler extension was just updated. Reload the window to " +
                    "finish enabling marketplaces, then add it again.",
            );
            return;
        }
        this.notifier.notifyError("Failed to add marketplace.", error);
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

    /**
     * {@link TemplateMarketplaceService.updateAll} swallows per-marketplace
     * errors itself, so this never blocks even fully offline. Its outcome is
     * folded into one summary toast — success count on the happy path, an error
     * toast listing each failed marketplace and why on partial failure.
     */
    private async updateMarketplaces(): Promise<void> {
        const outcome = await this.notifier.withProgress("Updating marketplaces…", () =>
            this.marketplaceSvc.updateAll(),
        );
        await this.refreshOpenEditors();

        const total = outcome.succeeded + outcome.failures.length;
        if (total === 0) {
            this.notifier.showInfo("No marketplaces configured to update.");
            return;
        }
        if (outcome.failures.length === 0) {
            this.notifier.showInfo(`Updated ${outcome.succeeded} marketplace(s).`);
            return;
        }
        const details = outcome.failures.map((f) => `${f.label}: ${f.reason}`).join("\n");
        this.notifier.showError(
            `Updated ${outcome.succeeded} of ${total} marketplaces. Failed:\n${details}`,
        );
    }

    /**
     * Unregisters one or more marketplaces via a multi-select quick pick. The
     * pick's OK is the confirmation (re-adding is cheap), so there is no extra
     * dialog. Cache eviction goes through the prune-only
     * {@link TemplateMarketplaceService.pruneOrphanedCaches} — never `updateAll`,
     * which would re-fetch every survivor over the network. The toast reports the
     * **selection** count, not the prune count: a removed entry may have had no
     * cache slot, and a remaining malformed entry suppresses pruning for the run.
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

        try {
            await this.settings.removeMarketplaces(picked.map((item) => item.entry));
            // Local-only and fast — no progress indicator needed, unlike a fetch.
            const pruned = await this.marketplaceSvc.pruneOrphanedCaches();
            this.notifier.logDebug(`Pruned marketplace cache(s): ${pruned.join(", ") || "none"}`);
            await this.refreshOpenEditors();
            this.notifier.showInfo(`Removed ${picked.length} marketplace(s).`);
        } catch (error) {
            this.notifier.notifyError("Failed to remove marketplace(s).", error as Error);
        }
    }

    private async refreshOpenEditors(): Promise<void> {
        for (const editorId of this.editorStore.getEditorIds()) {
            await this.templatesSvc.setElementTemplates(editorId);
        }
    }
}
