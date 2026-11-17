import { ExtensionContext } from "vscode";

import {
    ConflictMarkerParticipant,
    DiffPaneStore,
    MergeBuildService,
    MergeDecisionService,
    MergePaneCommandService,
    MergeSessionStore,
    MergeViewOpener,
    ResolvableConflictsService,
} from "@miragon/bpmn-modeler-core";
import { MergeController } from "../diff/adapter/in/MergeController";
import { MergeKeyboardController } from "../diff/adapter/in/MergeKeyboardController";
import { VsCodeGitConflictVersions } from "../diff/adapter/out/VsCodeGitConflictVersions";
import { VsCodeMergeCommandAvailability } from "../diff/adapter/out/VsCodeMergeCommandAvailability";
import { VsCodeMergePaneCommandKeys } from "../diff/adapter/out/VsCodeMergePaneCommandKeys";
import { VsCodeMergeSidesView } from "../diff/adapter/out/VsCodeMergeSidesView";
import { VsCodeMergeWorkingFile } from "../diff/adapter/out/VsCodeMergeWorkingFile";
import { SharedDeps } from "./sharedDeps";

/**
 * The BPMN merge view: Git through its extension's API, the panes under
 * `bpmn-merge:`, the command, the offer on conflict markers, the decisions
 * the panes show, their keyboard commands and the build into the working file. Its panes are
 * BPMN diff panes, so the diff feature registers it on its BPMN pane store.
 */
export function register(
    context: ExtensionContext,
    diffStore: DiffPaneStore,
    deps: SharedDeps,
): {
    sessions: MergeSessionStore;
    opener: MergeViewOpener;
    decisions: MergeDecisionService;
    build: MergeBuildService;
    paneCommands: MergePaneCommandService;
    keyboard: MergeKeyboardController;
    conflictMarkers: ConflictMarkerParticipant;
} {
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
    const decisions = new MergeDecisionService(sessions, deps.notifier);
    const build = new MergeBuildService(
        sessions,
        decisions,
        new VsCodeMergeWorkingFile(),
        sides,
        diffStore,
        deps.notifier,
        deps.picker,
    );
    context.subscriptions.push(sessions, resolvable.start(), build);
    new MergeController(opener, deps.notifier).register(context);
    const paneCommands = new MergePaneCommandService(
        diffStore,
        decisions,
        new VsCodeMergePaneCommandKeys(),
    );
    const keyboard = new MergeKeyboardController(paneCommands);
    keyboard.register(context);
    return {
        sessions,
        opener,
        decisions,
        build,
        paneCommands,
        keyboard,
        conflictMarkers: new ConflictMarkerParticipant(
            deps.vsDocument,
            deps.actionNotifier,
            opener,
        ),
    };
}
