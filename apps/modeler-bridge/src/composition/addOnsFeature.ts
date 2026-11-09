import { AddOnsFeature, BpmnEditorFeature, BpmnPluginsFeature } from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The add-on catalog over the plugin and rule package features, the one VS
 * Code builds. No view attaches yet, and it lists only the folders the host
 * registered.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: { editor: BpmnEditorFeature; plugins: BpmnPluginsFeature },
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
    });
}
