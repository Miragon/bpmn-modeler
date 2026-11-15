import { ExtensionContext } from "vscode";

import {
    BpmnDiffService,
    ConflictMarkerParticipant,
    createDiffPaneRouter,
    createDmnDiffPaneRouter,
    DiffPaneStore,
    DmnDiffService,
    ElementXmlDiffService,
    MergeSessionStore,
    MergeViewOpener,
    ResolvableConflictsService,
} from "@miragon/bpmn-modeler-core";
import { DiffController, DiffPaneFormat } from "../diff/adapter/in/DiffController";
import { MergeController } from "../diff/adapter/in/MergeController";
import { VsCodeElementXmlDiffView } from "../diff/adapter/out/VsCodeElementXmlDiffView";
import { VsCodeGitConflictVersions } from "../diff/adapter/out/VsCodeGitConflictVersions";
import { VsCodeMergeCommandAvailability } from "../diff/adapter/out/VsCodeMergeCommandAvailability";
import { VsCodeMergeSidesView } from "../diff/adapter/out/VsCodeMergeSidesView";
import { WebviewPaneHandle } from "../diff/adapter/out/WebviewPaneHandle";
import { SharedDeps } from "./sharedDeps";

/**
 * The diff feature owns one pane store, service and controller per format
 * (BPMN, DMN) because nothing outside it touches the diff-pane lifecycle. The
 * controllers are returned because two other features (the editors'
 * delegate-resolve, `compare`) dispatch into them — the one diff collaborator
 * with cross-feature reach. The BPMN merge view lives here too: its panes are
 * BPMN diff panes, and the BPMN editor lists its conflict-marker participant.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
): {
    diffController: DiffController;
    diffStore: DiffPaneStore;
    dmnDiffController: DiffController;
    dmnDiffStore: DiffPaneStore;
    mergeSessions: MergeSessionStore;
    conflictMarkers: ConflictMarkerParticipant;
} {
    const diffStore = new DiffPaneStore();
    const dmnDiffStore = new DiffPaneStore();
    context.subscriptions.push(diffStore, dmnDiffStore);
    const merge = mergeView(context, diffStore, deps);
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
                merge.sessions,
            ),
        ),
        merge.opener,
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

    return {
        diffController,
        diffStore,
        dmnDiffController,
        dmnDiffStore,
        mergeSessions: merge.sessions,
        conflictMarkers: new ConflictMarkerParticipant(
            deps.vsDocument,
            deps.actionNotifier,
            merge.opener,
        ),
    };
}

/** The merge view: Git through its extension's API, the panes under `bpmn-merge:`, the command. */
function mergeView(
    context: ExtensionContext,
    diffStore: DiffPaneStore,
    deps: SharedDeps,
): { sessions: MergeSessionStore; opener: MergeViewOpener } {
    const sides = new VsCodeMergeSidesView();
    sides.register(context);
    const git = new VsCodeGitConflictVersions();
    const sessions = new MergeSessionStore(diffStore, sides);
    const opener = new MergeViewOpener(git, sides, diffStore, sessions, deps.notifier);
    const resolvable = new ResolvableConflictsService(
        git,
        new VsCodeMergeCommandAvailability(),
        deps.notifier,
    );
    context.subscriptions.push(sessions, resolvable.start());
    new MergeController(opener, deps.notifier).register(context);
    return { sessions, opener };
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
