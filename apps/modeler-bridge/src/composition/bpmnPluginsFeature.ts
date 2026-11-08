import { BpmnPluginsFeature } from "@miragon/bpmn-modeler-core";

import { pluginApprovalHandlers } from "../bpmnPlugins/adapter/in/pluginApprovalHandlers";
import { NodeContentHasher } from "../bpmnPlugins/adapter/out/NodeContentHasher";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The workspace bpmn-js plugins are the core {@link BpmnPluginsFeature}, the
 * one VS Code builds. The host keeps the approvals in its application store
 * and serves the cache below `cacheRoot` from its loopback webview origin.
 */
export function register(
    deps: BridgeSharedDeps,
    { cacheRoot }: { cacheRoot: string },
): BpmnPluginsFeature {
    const plugins = new BpmnPluginsFeature({
        store: deps.store,
        workspace: deps.nodeWorkspace,
        artifacts: deps.artifactSvc,
        notifier: deps.notifier,
        picker: deps.picker,
        actionNotifier: deps.actionNotifier,
        approvals: deps.pluginApprovals,
        questions: deps.approvalQuestions,
        cacheRoot,
        hasher: new NodeContentHasher(),
    });

    bindHandlers(deps.rpc, pluginApprovalHandlers(deps.pluginApprovals));

    return plugins;
}
