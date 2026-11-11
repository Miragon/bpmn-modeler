import {
    AddOnsFeature,
    BpmnEditorFeature,
    BpmnPluginsFeature,
    MarketplaceAddOnSource,
} from "@miragon/bpmn-modeler-core";

import { addOnsHandlers } from "../addOns/adapter/in/addOnsHandlers";
import { METHODS } from "../protocol/domain/descriptor";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The add-on catalog over the plugin, rule package and template owners and
 * the marketplace commands, the one VS Code builds, with the template switches
 * IntelliJ keeps. It lists only the folders the host registered. The one
 * panel is the Add-ons tab of IntelliJ's BPMN Modeler tool window, attached
 * hidden at start; `post` notifies the host, which pushes the Query into its
 * JCEF browser.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: {
        editor: BpmnEditorFeature;
        plugins: BpmnPluginsFeature;
        marketplaces: MarketplaceAddOnSource;
    },
): AddOnsFeature {
    const addOns = new AddOnsFeature({
        workspace: deps.nodeWorkspace,
        settings: deps.settings,
        notifier: deps.notifier,
        approvals: deps.pluginApprovals,
        settingChanges: deps.settings,
        restart: "restartIde",
        contentRows: deps.contentRows,
        plugins: handles.plugins.inventory,
        rulePackages: handles.editor.rulePackageInventory,
        templates: handles.editor.templateInventory,
        marketplaces: handles.marketplaces,
        templatePreferences: deps.templatePreferences,
        workspaceTrust: deps.workspaceTrust,
    });
    // Building for a hidden tab would be wasted RPC; the host reports it in `addOns/open`.
    const panel = addOns.attachPanel(
        (message) => deps.rpc.notify(METHODS.addOnsPostMessage, { message }),
        false,
    );
    bindHandlers(
        deps.rpc,
        addOnsHandlers({
            addOns,
            panel,
            settingsMirror: deps.settings,
            workspaceRoots: deps.nodeWorkspace,
            log: deps.log,
        }),
    );
    return addOns;
}
