import { ExtensionContext } from "vscode";

import {
    BpmnDiffService,
    createDiffPaneRouter,
    createDmnDiffPaneRouter,
    DiffPaneStore,
    DmnDiffService,
    ElementXmlDiffService,
} from "@miragon/bpmn-modeler-core";
import { DiffController, DiffPaneFormat } from "../diff/adapter/in/DiffController";
import { VsCodeElementXmlDiffView } from "../diff/adapter/out/VsCodeElementXmlDiffView";
import { WebviewPaneHandle } from "../diff/adapter/out/WebviewPaneHandle";
import { SharedDeps } from "./sharedDeps";

/**
 * The diff feature owns one pane store, service and controller per format
 * (BPMN, DMN) because nothing outside it touches the diff-pane lifecycle. The
 * controllers are returned because two other features (the editors'
 * delegate-resolve, `compare`) dispatch into them — the one diff collaborator
 * with cross-feature reach.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
): {
    diffController: DiffController;
    diffStore: DiffPaneStore;
    dmnDiffController: DiffController;
    dmnDiffStore: DiffPaneStore;
} {
    const diffStore = new DiffPaneStore();
    const dmnDiffStore = new DiffPaneStore();
    context.subscriptions.push(diffStore, dmnDiffStore);
    const diffController = new DiffController(
        diffStore,
        deps.notifier,
        (panel, document) => new WebviewPaneHandle(panel, document, "bpmnDiffPane"),
        deps.preferences,
        bpmnDiffFormat(
            new BpmnDiffService(
                deps.notifier,
                deps.vsSettings,
                diffStore,
                elementXmlDiffs(context, diffStore, deps),
            ),
        ),
    );
    const dmnDiffController = new DiffController(
        dmnDiffStore,
        deps.notifier,
        (panel, document) => new WebviewPaneHandle(panel, document, "dmnDiffPane"),
        deps.preferences,
        dmnDiffFormat(new DmnDiffService(deps.notifier, deps.vsSettings, dmnDiffStore)),
    );
    diffController.register(context);
    dmnDiffController.register(context);

    return { diffController, diffStore, dmnDiffController, dmnDiffStore };
}

/** The element XML diffs below the diagram diffs, or `undefined` where the host cannot show them. */
function elementXmlDiffs(
    context: ExtensionContext,
    diffStore: DiffPaneStore,
    deps: SharedDeps,
): ElementXmlDiffService | undefined {
    if (!VsCodeElementXmlDiffView.isSupportedByHost()) {
        return undefined;
    }
    let service: ElementXmlDiffService | undefined = undefined;
    const view = new VsCodeElementXmlDiffView((diffKey) => service?.closedByUser(diffKey));
    view.register(context);
    service = new ElementXmlDiffService(diffStore, view, deps.notifier);
    return service;
}

export function bpmnDiffFormat(service: BpmnDiffService): DiffPaneFormat {
    return {
        extension: ".bpmn",
        createRouter: (extensions) => createDiffPaneRouter(service, extensions),
        rebroadcastLanguage: () => service.rebroadcastLanguage(),
    };
}

export function dmnDiffFormat(service: DmnDiffService): DiffPaneFormat {
    return {
        extension: ".dmn",
        createRouter: (extensions) => createDmnDiffPaneRouter(service, extensions),
        rebroadcastLanguage: () => service.rebroadcastLanguage(),
    };
}
