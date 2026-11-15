import { commands, ExtensionContext, TabInputCustom, TabInputText, Uri, window } from "vscode";

import { lastWorkspacePathSegment, MergeSession, NotifierPort } from "@miragon/bpmn-modeler-core";
import { VsCodeMergeWorkingFile } from "../out/VsCodeMergeWorkingFile";

export const TAKE_INCOMING_FOR_EVERY_CONFLICT = "bpmn-modeler.spikeTakeIncomingForEveryConflict";

/** SPIKE: the merge sessions the open merge views started, by working-file URI. */
export class MergeSessions {
    private readonly byFile = new Map<string, MergeSession>();
    private latest: MergeSession | undefined;

    add(session: MergeSession): void {
        this.byFile.set(session.fileUri, session);
        this.latest = session;
    }

    find(fileUri: Uri | undefined): MergeSession | undefined {
        return fileUri ? this.byFile.get(fileUri.toString()) : this.latest;
    }
}

/**
 * SPIKE (phase B, B2/B3): stands in for the webview picks and #2456's Build. Picks incoming for
 * every open conflict, builds the merged file, writes it over the working file and opens it.
 */
export class MergeBuildController {
    constructor(
        private readonly sessions: MergeSessions,
        private readonly workingFile: VsCodeMergeWorkingFile,
        private readonly notifier: NotifierPort,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(TAKE_INCOMING_FOR_EVERY_CONFLICT, (fileUri?: Uri) =>
                this.takeIncomingAndBuild(fileUri instanceof Uri ? fileUri : undefined),
            ),
        );
    }

    async takeIncomingAndBuild(fileUri: Uri | undefined): Promise<void> {
        const session = this.sessions.find(fileUri);
        if (!session) {
            this.notifier.showInfo("Open a conflicted BPMN file in the merge view first.");
            return;
        }
        const target = Uri.parse(session.fileUri);
        const fileName = lastWorkspacePathSegment(target.path);
        try {
            const outcome = session.takeSideForEveryOpenConflict("incoming");
            this.log(`take incoming: ${JSON.stringify(outcome)}`);
            if (outcome.openConflicts > 0) {
                this.notifier.showError(
                    `${fileName}: ${outcome.openConflicts} conflicts stay open (${session.openConflictIds.join(", ")}).`,
                );
                return;
            }
            const { xml, notes } = await session.build();
            this.log(`built ${fileName}: ${xml.length} chars, notes ${JSON.stringify(notes)}`);
            await this.workingFile.replace(target, xml);
            this.log(`wrote ${target.toString()}`);
            await this.notifier.openDocument(target.fsPath);
            this.log(`opened ${target.toString()}: active tab ${describeActiveTab()}`);
            this.notifier.showInfo(
                `Built ${fileName} from the merge (${notes.length} notes). Stage it to mark the conflict resolved.`,
            );
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.notifier.showError(`Failed to build ${fileName}: ${String(error)}`);
        }
    }

    private log(line: string): void {
        this.notifier.logInfo(`[merge-spike] ${line}`);
    }
}

/** Answers spike question 1.0.5 in the log: which editor `vscode.open` chose. */
function describeActiveTab(): string {
    const tab = window.tabGroups.activeTabGroup.activeTab;
    const input = tab?.input;
    if (input instanceof TabInputCustom) {
        return `custom viewType=${input.viewType} uri=${input.uri.toString()}`;
    }
    if (input instanceof TabInputText) return `text uri=${input.uri.toString()}`;
    return `other label=${tab?.label ?? "none"}`;
}
