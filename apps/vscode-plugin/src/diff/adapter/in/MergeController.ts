import { commands, ExtensionContext, Uri, window } from "vscode";

import {
    DiffPaneStore,
    lastWorkspacePathSegment,
    MergeSession,
    NotifierPort,
} from "@miragon/bpmn-modeler-core";
import { VsCodeGitConflictVersions } from "../out/VsCodeGitConflictVersions";
import { VsCodeMergeSidesView } from "../out/VsCodeMergeSidesView";
import { MergeSessions } from "./MergeBuildController";

export const OPEN_BPMN_MERGE_VIEW = "bpmn-modeler.openBpmnMergeView";

/** What a command receives from a Source Control row, an editor title or the palette. */
type MergeCommandArgument = Uri | { readonly resourceUri?: Uri } | undefined;

/**
 * SPIKE: opens current (stage 2) and incoming (stage 3) of a conflicted `.bpmn` side by side.
 * Today's compare-files session stands in for the merge session, so both panes show the plain
 * diff between the two sides.
 */
export class MergeController {
    constructor(
        private readonly store: DiffPaneStore,
        private readonly git: VsCodeGitConflictVersions,
        private readonly view: VsCodeMergeSidesView,
        private readonly notifier: NotifierPort,
        private readonly sessions: MergeSessions,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(OPEN_BPMN_MERGE_VIEW, (argument: MergeCommandArgument) =>
                this.open(argument),
            ),
        );
    }

    async open(argument: MergeCommandArgument): Promise<void> {
        const fileUri = fileUriOf(argument);
        if (!fileUri) {
            this.notifier.showInfo("Select a conflicted BPMN file to open the merge view.");
            return;
        }
        try {
            const stages = await this.git.read(fileUri);
            this.notifier.logInfo(
                `[merge-spike] ${fileUri.toString()}: git=${stages.gitAvailable} inMergeChanges=${stages.inMergeChanges} base=${stages.base !== undefined} current=${stages.current !== undefined} incoming=${stages.incoming !== undefined}`,
            );
            if (stages.current === undefined || stages.incoming === undefined) {
                this.notifier.showInfo(
                    `${lastWorkspacePathSegment(fileUri.path)} has no two sides to merge.`,
                );
                return;
            }
            await this.startSession(fileUri, {
                base: stages.base,
                current: stages.current,
                incoming: stages.incoming,
            });
            const uris = this.view.serve(fileUri, {
                current: stages.current,
                incoming: stages.incoming,
            });
            const current = uris.current.toString();
            const incoming = uris.incoming.toString();
            this.store.registerCompareFiles(current, incoming);
            this.notifier.logInfo(`[merge-spike] registered current=${current}`);
            this.notifier.logInfo(`[merge-spike] registered incoming=${incoming}`);
            const title = `${lastWorkspacePathSegment(fileUri.path)} (Current ↔ Incoming)`;
            await this.view.open(uris, title);
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.notifier.showError(`Failed to open the merge view: ${String(error)}`);
        }
    }

    /** SPIKE: a merge the library refuses still opens the two sides; only the build is refused. */
    private async startSession(
        fileUri: Uri,
        versions: { base?: string; current: string; incoming: string },
    ): Promise<void> {
        try {
            const session = await MergeSession.start(fileUri.toString(), versions);
            this.sessions.add(session);
            this.notifier.logInfo(
                `[merge-spike] merge session ${fileUri.toString()}: open conflicts ${JSON.stringify(session.openConflictIds)}`,
            );
        } catch (error) {
            this.notifier.logInfo(`[merge-spike] computeMerge refused: ${String(error)}`);
        }
    }
}

function fileUriOf(argument: MergeCommandArgument): Uri | undefined {
    if (argument instanceof Uri) return argument;
    if (argument?.resourceUri) return argument.resourceUri;
    return window.activeTextEditor?.document.uri;
}
