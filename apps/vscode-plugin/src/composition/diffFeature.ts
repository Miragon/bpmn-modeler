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
import { MergeBuildController, MergeSessions } from "../diff/adapter/in/MergeBuildController";
import { MergeController } from "../diff/adapter/in/MergeController";
import { VsCodeElementXmlDiffView } from "../diff/adapter/out/VsCodeElementXmlDiffView";
import { VsCodeGitConflictVersions } from "../diff/adapter/out/VsCodeGitConflictVersions";
import { VsCodeMergeSidesView } from "../diff/adapter/out/VsCodeMergeSidesView";
import { VsCodeMergeWorkingFile } from "../diff/adapter/out/VsCodeMergeWorkingFile";
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
    registerMergeView(context, diffStore, deps);

    return { diffController, diffStore, dmnDiffController, dmnDiffStore };
}

/** SPIKE: the merge view's command, Git adapter and `bpmn-merge:` documents. */
function registerMergeView(
    context: ExtensionContext,
    diffStore: DiffPaneStore,
    deps: SharedDeps,
): void {
    const view = new VsCodeMergeSidesView();
    view.register(context);
    const git = new VsCodeGitConflictVersions((line) =>
        deps.notifier.logInfo(`[merge-spike] ${line}`),
    );
    const sessions = new MergeSessions();
    new MergeController(diffStore, git, view, deps.notifier, sessions).register(context);
    new MergeBuildController(sessions, new VsCodeMergeWorkingFile(), deps.notifier).register(
        context,
    );
    context.subscriptions.push(
        diffStore.onSessionClosed((session) => {
            view.releaseUris([session.beforeUri, session.afterUri]);
        }),
    );
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
