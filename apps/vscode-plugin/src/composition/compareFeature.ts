import { ExtensionContext } from "vscode";

import {
    BPMN_COMPARE_SELECTION_KEY,
    CompareSelectionStore,
} from "../diff/adapter/in/CompareSelectionStore";
import { BPMN_COMPARE, CompareController } from "../diff/adapter/in/CompareController";
import { DiffController } from "../diff/adapter/in/DiffController";
import { SharedDeps } from "./sharedDeps";

/**
 * The "compare two diagrams" feature owns the selection store but delegates the
 * actual rendering to the diff feature's controller, passed in as a handle — it
 * has no lifecycle of its own to hand back.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: { diffController: DiffController },
): void {
    new CompareController(
        new CompareSelectionStore(BPMN_COMPARE_SELECTION_KEY),
        handles.diffController,
        deps.notifier,
        BPMN_COMPARE,
    ).register(context);
}
