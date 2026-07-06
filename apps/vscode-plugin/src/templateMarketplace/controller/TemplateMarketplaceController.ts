import { homedir } from "node:os";
import { join } from "node:path";

import { commands, ExtensionContext, window } from "vscode";

import {
    BpmnElementTemplatesService,
    EditorSessionStore,
    parseMarketplaceUrl,
    TemplateMarketplaceService,
} from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { VsCodeSettings } from "../../shared/infrastructure/VsCodeSettings";

export const ADD_MARKETPLACE_CMD = "bpmn-modeler.addMarketplace";
export const UPDATE_MARKETPLACES_CMD = "bpmn-modeler.updateMarketplaces";

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
 * Host glue for the marketplace commands: owns the `vscode` input box, progress,
 * and command registration, delegating all fetch/cache logic to the
 * host-agnostic {@link TemplateMarketplaceService}. After any successful fetch it
 * re-pushes templates to open editors so newly cached ones appear without reopening.
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

        // Persist the expanded path so a re-fetch via Update (which re-reads
        // settings) never sees a `~`.
        const location = expandHomePath(input.trim());
        try {
            await this.notifier.withProgress("Adding marketplace…", () =>
                this.marketplaceSvc.addMarketplace(location),
            );
            await this.settings.addMarketplace(location);
            this.notifier.logDebug(`Marketplace registration persisted to settings: ${location}`);
            await this.refreshOpenEditors();
            this.notifier.showInfo("Marketplace added.");
        } catch (error) {
            this.notifier.notifyError("Failed to add marketplace.", error as Error);
        }
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

    private async refreshOpenEditors(): Promise<void> {
        for (const editorId of this.editorStore.getEditorIds()) {
            await this.templatesSvc.setElementTemplates(editorId);
        }
    }
}
