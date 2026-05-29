import { ExtensionContext } from "vscode";

import { CompareSelectionStore } from "../diff/infrastructure/CompareSelectionStore";
import { BpmnCompareController } from "../diff/controller/BpmnCompareController";
import { BpmnDiffController } from "../diff/controller/BpmnDiffController";
import { SharedDeps } from "./sharedDeps";

/**
 * The "compare two diagrams" feature owns the selection store but delegates the
 * actual rendering to the diff feature's controller, passed in as a handle — it
 * has no lifecycle of its own to hand back.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: { diffController: BpmnDiffController },
): void {
    const compareSelection = new CompareSelectionStore();
    new BpmnCompareController(compareSelection, handles.diffController, deps.notifier).register(
        context,
    );
}
