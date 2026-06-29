import { commands, ExtensionContext, window } from "vscode";

import {
    BpmnElementTemplatesService,
    EditorSessionStore,
    parseMarketplaceUrl,
    TemplateMarketplaceService,
} from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { VsCodeSettings } from "../../shared/infrastructure/VsCodeSettings";

// VS Code command IDs for the two marketplace commands.
export const ADD_MARKETPLACE_CMD = "bpmn-modeler.addTemplateMarketplace";
export const UPDATE_MARKETPLACES_CMD = "bpmn-modeler.updateTemplateMarketplaces";

/**
 * Host glue for the element-template marketplace commands.
 *
 * Lives in the controller (host) layer because it owns the `vscode` input box,
 * progress, and command registration; all fetch/cache logic sits behind the
 * host-agnostic {@link TemplateMarketplaceService}. After any successful
 * fetch it re-pushes templates to every open editor so newly cached templates
 * appear without reopening the diagram.
 */
export class TemplateMarketplaceController {
    /**
     * @param marketplaceSvc Fetch/cache orchestration.
     * @param templatesSvc Re-run to re-post the merged template set per editor.
     * @param editorStore Source of open-editor ids to refresh.
     * @param settings Persists the registration on a successful add.
     * @param notifier Progress + error/info surfacing.
     */
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
     * Prompts for a marketplace location (a public GitHub repo or a local
     * folder), fetches it, and — only if the fetch succeeds — persists the
     * registration. Persisting after the fetch means a location whose
     * `marketplace.json` is missing never lands in settings.
     */
    private async addMarketplace(): Promise<void> {
        const url = await window.showInputBox({
            title: "Add Template Marketplace",
            prompt: "Public GitHub repository, or a local folder, holding a marketplace.json",
            placeHolder: "https://github.com/owner/repo  or  /path/to/folder",
            // Reuse the domain parser as the validator so the accepted forms can
            // never drift from what the service actually resolves.
            validateInput: (value) => {
                try {
                    parseMarketplaceUrl(value);
                    return undefined;
                } catch {
                    return "Enter a GitHub repository URL or a local folder path holding a marketplace.json.";
                }
            },
        });
        if (!url) {
            return;
        }

        try {
            await this.notifier.withProgress("Adding template marketplace…", () =>
                this.marketplaceSvc.addMarketplace(url),
            );
            await this.settings.addTemplateMarketplace(url);
            await this.refreshOpenEditors();
            this.notifier.showInfo("Template marketplace added.");
        } catch (error) {
            this.notifier.notifyError("Failed to add template marketplace.", error as Error);
        }
    }

    /**
     * Manually re-fetches all registered marketplaces (decision D7).
     * {@link TemplateMarketplaceService.updateAll} swallows per-marketplace
     * errors itself, so this never blocks even fully offline.
     */
    private async updateMarketplaces(): Promise<void> {
        await this.notifier.withProgress("Updating template marketplaces…", () =>
            this.marketplaceSvc.updateAll(),
        );
        await this.refreshOpenEditors();
    }

    private async refreshOpenEditors(): Promise<void> {
        for (const editorId of this.editorStore.getEditorIds()) {
            await this.templatesSvc.setElementTemplates(editorId);
        }
    }
}
