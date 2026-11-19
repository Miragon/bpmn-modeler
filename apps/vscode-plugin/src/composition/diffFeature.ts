import { ExtensionContext } from "vscode";

import {
    BpmnDiffService,
    ConflictMarkerParticipant,
    ElementXmlMergeService,
    createDiffPaneRouter,
    createDmnDiffPaneRouter,
    DiffPaneStore,
    DmnDiffService,
    ElementXmlDiffService,
    type MergePaneCommands,
    MergeSessionStore,
} from "@miragon/bpmn-modeler-core";
import { DiffController, DiffPaneFormat } from "../diff/adapter/in/DiffController";
import { VsCodeElementXmlDiffView } from "../diff/adapter/out/VsCodeElementXmlDiffView";
import { VsCodeMergeEditorAvailability } from "../diff/adapter/out/VsCodeMergeEditorAvailability";
import { WebviewPaneHandle } from "../diff/adapter/out/WebviewPaneHandle";
import * as elementXmlMergeFeature from "./elementXmlMergeFeature";
import * as mergeViewFeature from "./mergeViewFeature";
import { SharedDeps } from "./sharedDeps";

/**
 * The diff feature owns one pane store, service and controller per format
 * (BPMN, DMN) because nothing outside it touches the diff-pane lifecycle. The
 * controllers are returned because two other features (the editors'
 * delegate-resolve, `compare`) dispatch into them — the one diff collaborator
 * with cross-feature reach. The BPMN merge view registers on the BPMN pane
 * store, since its panes are BPMN diff panes, and its element XML merge editor
 * on the merge view. Whether the host shows an element's XML diff and runs the
 * merge editor is read once here, for the routes and the panes' offers alike.
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
    /** Builds the newest merge view of a working file, as its Build button does. */
    buildMerge: (fileUri: string) => Promise<void>;
    elementXmlMerge: ElementXmlMergeService;
} {
    const diffStore = new DiffPaneStore();
    const dmnDiffStore = new DiffPaneStore();
    context.subscriptions.push(diffStore, dmnDiffStore);
    const showsElementXmlChanges = VsCodeElementXmlDiffView.isSupportedByHost();
    const mergeEditor = new VsCodeMergeEditorAvailability();
    const merge = mergeViewFeature.register(context, diffStore, deps, async () => ({
        elementXmlChanges: showsElementXmlChanges,
        elementXmlMerge: await mergeEditor.ready,
    }));
    const elementXmlMerge = elementXmlMergeFeature.register(context, deps, merge, mergeEditor);
    const bpmnDiffService = new BpmnDiffService(
        deps.notifier,
        deps.vsSettings,
        diffStore,
        showsElementXmlChanges
            ? elementXmlDiffs(context, diffStore, deps, merge.sessions)
            : undefined,
        merge.decisions,
        merge.build,
        elementXmlMerge,
    );
    const diffController = new DiffController(
        diffStore,
        deps.notifier,
        (panel, document) => new WebviewPaneHandle(panel, document, "bpmnDiffPane"),
        deps.preferences,
        bpmnDiffFormat(bpmnDiffService, merge.paneCommands),
        merge.opener,
        merge.keyboard,
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
        conflictMarkers: merge.conflictMarkers,
        buildMerge: (fileUri) => merge.build.buildFile(fileUri),
        elementXmlMerge,
    };
}

/** The element XML diffs below the diagram diffs. */
function elementXmlDiffs(
    context: ExtensionContext,
    diffStore: DiffPaneStore,
    deps: SharedDeps,
    merges: MergeSessionStore,
): ElementXmlDiffService {
    let service: ElementXmlDiffService | undefined = undefined;
    const view = new VsCodeElementXmlDiffView((diffKey) => service?.closedByUser(diffKey));
    view.register(context);
    service = new ElementXmlDiffService(diffStore, view, deps.notifier, merges);
    return service;
}

export function bpmnDiffFormat(
    service: BpmnDiffService,
    mergePaneCommands?: MergePaneCommands,
): DiffPaneFormat {
    return {
        extension: ".bpmn",
        createRouter: (extensions) =>
            createDiffPaneRouter(service, { ...extensions, mergePaneCommands }),
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
