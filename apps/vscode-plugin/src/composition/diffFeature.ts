import { ExtensionContext } from "vscode";

import { createDiffPaneRouter, DiffPaneStore } from "@miragon/bpmn-modeler-core";
import { BpmnDiffService } from "@miragon/bpmn-modeler-core";
import { DiffController, DiffPaneFormat } from "../diff/adapter/in/DiffController";
import { WebviewPaneHandle } from "../diff/adapter/out/WebviewPaneHandle";
import { SharedDeps } from "./sharedDeps";

/**
 * The diff feature owns its pane store, service, and controller because nothing
 * outside it touches the diff-pane lifecycle. The constructed `diffController`
 * is returned because two other features (`editor` delegate-resolve, `compare`)
 * dispatch into it — it is the one diff collaborator with cross-feature reach.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
): { diffController: DiffController; diffStore: DiffPaneStore } {
    const diffStore = new DiffPaneStore();
    context.subscriptions.push(diffStore);
    const diffService = new BpmnDiffService(deps.notifier, deps.vsSettings, diffStore);
    const diffController = new DiffController(
        diffStore,
        deps.notifier,
        (panel, document) => new WebviewPaneHandle(panel, document),
        deps.preferences,
        bpmnDiffFormat(diffService),
    );
    diffController.register(context);

    return { diffController, diffStore };
}

export function bpmnDiffFormat(service: BpmnDiffService): DiffPaneFormat {
    return {
        extension: ".bpmn",
        createRouter: (extensions) => createDiffPaneRouter(service, extensions),
        rebroadcastLanguage: () => service.rebroadcastLanguage(),
    };
}
