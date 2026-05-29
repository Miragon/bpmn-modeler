import { ExtensionContext } from "vscode";

import { DiffPaneStore } from "../infrastructure/DiffPaneStore";
import { BpmnDiffService } from "../service/BpmnDiffService";
import { BpmnDiffController } from "../controller/BpmnDiffController";
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
): { diffController: BpmnDiffController } {
    const diffStore = new DiffPaneStore();
    context.subscriptions.push(diffStore);
    const diffService = new BpmnDiffService(deps.notifier, deps.vsSettings, diffStore);
    const diffController = new BpmnDiffController(diffStore, diffService, deps.notifier);
    diffController.register(context);

    return { diffController };
}
