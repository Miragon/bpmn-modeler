import { ExtensionContext } from "vscode";

import {
    AddOnsFeature,
    BpmnEditorFeature,
    BpmnPluginsFeature,
    MarketplaceAddOnSource,
} from "@miragon/bpmn-modeler-core";
import { SharedDeps } from "./sharedDeps";

/**
 * The add-on catalog over the plugin, rule package and template owners the
 * BPMN editor built, the approval list they share, the template switches and
 * the marketplace commands. No view attaches yet.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: {
        editor: BpmnEditorFeature;
        plugins: BpmnPluginsFeature;
        marketplaces: MarketplaceAddOnSource;
    },
): { addOns: AddOnsFeature } {
    const addOns = new AddOnsFeature({
        workspace: deps.vsWorkspace,
        settings: deps.vsSettings,
        notifier: deps.notifier,
        approvals: deps.pluginApprovals,
        settingChanges: {
            onDidChange: (listener) => deps.preferences.onDidChangeSetting(listener),
        },
        restart: "reloadWindow",
        plugins: handles.plugins.inventory,
        rulePackages: handles.editor.rulePackageInventory,
        templates: handles.editor.templateInventory,
        marketplaces: handles.marketplaces,
        templatePreferences: deps.templatePreferences,
    });
    context.subscriptions.push(addOns);
    return { addOns };
}
