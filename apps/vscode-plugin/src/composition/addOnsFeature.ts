import { ExtensionContext } from "vscode";

import { AddOnsFeature, BpmnEditorFeature, BpmnPluginsFeature } from "@miragon/bpmn-modeler-core";
import { SharedDeps } from "./sharedDeps";

/**
 * The add-on catalog over the plugin and rule package features the BPMN
 * editor built, and the approval list they share. No view attaches yet.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: { editor: BpmnEditorFeature; plugins: BpmnPluginsFeature },
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
    });
    context.subscriptions.push(addOns);
    return { addOns };
}
