import {
    AddOnsFeature,
    BpmnEditorFeature,
    BpmnPluginsFeature,
    MarketplaceAddOnSource,
} from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The add-on catalog over the plugin, rule package and template owners and
 * the marketplace commands, the one VS Code builds, with the template switches
 * IntelliJ keeps. No view attaches yet, and it lists only the folders the host
 * registered.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: {
        editor: BpmnEditorFeature;
        plugins: BpmnPluginsFeature;
        marketplaces: MarketplaceAddOnSource;
    },
): AddOnsFeature {
    return new AddOnsFeature({
        workspace: deps.nodeWorkspace,
        settings: deps.settings,
        notifier: deps.notifier,
        approvals: deps.pluginApprovals,
        settingChanges: deps.settings,
        restart: "restartIde",
        plugins: handles.plugins.inventory,
        rulePackages: handles.editor.rulePackageInventory,
        templates: handles.editor.templateInventory,
        marketplaces: handles.marketplaces,
        templatePreferences: deps.templatePreferences,
    });
}
