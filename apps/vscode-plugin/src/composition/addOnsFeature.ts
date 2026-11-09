import { ExtensionContext } from "vscode";

import {
    AddOnsFeature,
    BpmnEditorFeature,
    BpmnPluginsFeature,
    MarketplaceAddOnSource,
    RouteLookup,
} from "@miragon/bpmn-modeler-core";
import { AddOnsViewProvider } from "../addOns/adapter/in/AddOnsViewProvider";
import { createWebviewNonce } from "../shared/adapter/out/webviewNonce";
import { SharedDeps } from "./sharedDeps";

/**
 * The add-on catalog over the plugin, rule package and template owners the
 * BPMN editor built, the approval list they share, the template switches and
 * the marketplace commands, shown in the Artifacts view.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: {
        editor: BpmnEditorFeature;
        plugins: BpmnPluginsFeature;
        marketplaces: MarketplaceAddOnSource;
    },
): { addOns: AddOnsFeature; addOnsViewRoutes: RouteLookup } {
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
    new AddOnsViewProvider(addOns, context.extensionUri, createWebviewNonce).register(context);
    return { addOns, addOnsViewRoutes: addOns.panelRoutes };
}
