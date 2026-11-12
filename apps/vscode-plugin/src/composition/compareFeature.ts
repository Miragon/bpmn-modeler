import { ExtensionContext } from "vscode";

import {
    BPMN_COMPARE_SELECTION_KEY,
    CompareSelectionStore,
    DMN_COMPARE_SELECTION_KEY,
} from "../diff/adapter/in/CompareSelectionStore";
import { BPMN_COMPARE, CompareController, DMN_COMPARE } from "../diff/adapter/in/CompareController";
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
    handles: { diffController: DiffController; dmnDiffController: DiffController },
): void {
    new CompareController(
        new CompareSelectionStore(BPMN_COMPARE_SELECTION_KEY),
        handles.diffController,
        deps.notifier,
        BPMN_COMPARE,
    ).register(context);
    new CompareController(
        new CompareSelectionStore(DMN_COMPARE_SELECTION_KEY),
        handles.dmnDiffController,
        deps.notifier,
        DMN_COMPARE,
    ).register(context);
}
