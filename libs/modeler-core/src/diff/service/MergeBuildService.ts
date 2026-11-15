import { buildMerged, type MergedDocument } from "@miragon/bpmn-modeler-merge";
import type { MergeResultComparison } from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { filePathOfUri } from "../../kernel/domain/workspacePath";
import { NotifierPort, PickerPort } from "../../kernel/port/hostPorts";
import { mergeResultTabLabel } from "../domain/diffTabLabel";
import {
    buildDoneNotice,
    buildFailureText,
    buildRefusalText,
    compareFailureText,
    readFailureText,
    writeFailureText,
} from "../domain/mergeBuildTexts";
import { mergePaneBasename } from "../domain/mergePaneName";
import { otherMergeSide } from "../domain/mergePaneSide";
import { overwriteDecision } from "../domain/overwriteDecision";
import { MergePaneName, MergeSidesView } from "../port/MergeSidesView";
import { MergeWorkingFile } from "../port/MergeWorkingFile";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffSession } from "./DiffSession";
import { MergeDecisionService } from "./MergeDecisionService";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";

/** A built merge result compared with one stage: the merge view, the stage and where its documents are served. */
interface ResultComparison {
    readonly session: MergeSession;
    readonly against: MergeSide;
    readonly uris: Readonly<Record<MergePaneName, string>>;
}

/**
 * Builds a merge view's result into the working file and compares it with
 * either side. The working file is the trial run: a build replaces and saves
 * it, never stages it, and asks first where it would replace what the user
 * may want to keep; a build that fails writes nothing. A comparison is a
 * plain BPMN diff of a Git stage against a copy of the working file as it is
 * open, unsaved edits included, taken when it opens: it never shows the file
 * itself, so a tab of it restored later never claims the file. Switching it
 * opens the other side's and closes it.
 */
export class MergeBuildService implements EditorSubscription {
    private readonly comparisons = new Map<DiffSession, ResultComparison>();

    // A second Build while one runs would read the file between the first one's write and its record.
    private readonly building = new Set<MergeSession>();

    private readonly subscriptions: readonly EditorSubscription[];

    private readonly changedListeners = new Set<(diffSession: DiffSession) => void>();

    constructor(
        private readonly sessions: Pick<
            MergeSessionStore,
            "ofDiffSession" | "of" | "onSessionEnded"
        >,
        private readonly decisions: Pick<MergeDecisionService, "broadcastSession">,
        private readonly workingFile: MergeWorkingFile,
        private readonly view: MergeSidesView,
        private readonly diffStore: DiffPaneStore,
        private readonly notifier: NotifierPort,
        private readonly picker: Pick<PickerPort, "confirm">,
    ) {
        this.subscriptions = [
            diffStore.onSessionClosed((diffSession) => this.comparisonClosed(diffSession)),
            sessions.onSessionEnded((session) => this.mergeViewEnded(session)),
        ];
    }

    /** Calls `listener` with each comparison whose {@link comparisonOf} changed, so its panes are told again. */
    onComparisonChanged(listener: (diffSession: DiffSession) => void): EditorSubscription {
        this.changedListeners.add(listener);
        return { dispose: () => this.changedListeners.delete(listener) };
    }

    /** Builds the result of the merge view a tab shows into its working file. */
    async build(diffSession: DiffSession, elementXmlChanges: boolean): Promise<void> {
        const session = this.sessions.ofDiffSession(diffSession);
        if (session) await this.buildSession(session, elementXmlChanges);
    }

    /** Builds the result of the newest merge view of `fileUri`, if one is open. */
    async buildFile(fileUri: string, elementXmlChanges: boolean): Promise<void> {
        const session = this.sessions.of(fileUri);
        if (session) await this.buildSession(session, elementXmlChanges);
    }

    /** Opens a diff of `against`'s stage and the built result, once a result was built. */
    async compare(diffSession: DiffSession, against: MergeSide): Promise<void> {
        const session = this.sessions.ofDiffSession(diffSession);
        if (session?.lastBuild) await this.openComparison(session, against);
    }

    /** Opens the comparison against the other side and closes this one, which stays when the other cannot open. */
    async switchComparison(diffSession: DiffSession): Promise<void> {
        const comparison = this.comparisons.get(diffSession);
        if (!comparison || !this.canSwitch(comparison)) return;
        if (!(await this.openComparison(comparison.session, otherMergeSide(comparison.against)))) {
            return;
        }
        for (const pane of diffSession.attachedPanes()) pane.dispose();
    }

    /** The side a result comparison shows, for its panes' legend; `undefined` for any other diff. */
    comparisonOf(diffSession: DiffSession): MergeResultComparison | undefined {
        const comparison = this.comparisons.get(diffSession);
        if (comparison === undefined) return undefined;
        return this.canSwitch(comparison)
            ? { against: comparison.against, switchTo: otherMergeSide(comparison.against) }
            : { against: comparison.against };
    }

    dispose(): void {
        for (const subscription of this.subscriptions) subscription.dispose();
    }

    private async buildSession(session: MergeSession, elementXmlChanges: boolean): Promise<void> {
        if (this.building.has(session)) return;
        this.building.add(session);
        try {
            await this.buildOnce(session, elementXmlChanges);
        } finally {
            this.building.delete(session);
        }
    }

    private async buildOnce(session: MergeSession, elementXmlChanges: boolean): Promise<void> {
        const { decisions, fileName, fileUri } = session;
        if (!decisions.canBuild) {
            this.notifier.showInfo(buildRefusalText(fileName, decisions.openConflicts.length));
            return;
        }
        const workingFile = await this.workingFile.read(fileUri).catch((error: unknown) => {
            this.failed(readFailureText(fileName, asError(error)), error);
            return undefined;
        });
        if (!workingFile) return;
        const decision = overwriteDecision(
            workingFile,
            { opened: session.openedWorkingText, lastBuilt: session.lastBuild?.xml },
            fileName,
        );
        if (decision.kind === "confirm" && !(await this.picker.confirm(decision.request))) {
            return;
        }
        const merged = await this.merged(session);
        const saved = merged && (await this.written(session, merged));
        if (!merged || saved === undefined) return;
        session.lastBuild = { xml: saved, notes: merged.notes };
        // Before the file opens and hides the merge tab, so its panes hold the notes when shown again.
        await this.decisions.broadcastSession(session, elementXmlChanges);
        this.notifier.showInfo(buildDoneNotice(fileName, merged.notes.length));
        await this.notifier
            .openDocument(filePathOfUri(fileUri))
            .catch((error: unknown) => this.notifier.logError(asError(error)));
    }

    private async merged(session: MergeSession): Promise<MergedDocument | undefined> {
        try {
            return await buildMerged(session.sources, session.decisions);
        } catch (error) {
            this.failed(buildFailureText(session.fileName, asError(error)), error);
            return undefined;
        }
    }

    // What the file holds once saved: its line endings and save participants may have changed the text.
    private async written(
        session: MergeSession,
        merged: MergedDocument,
    ): Promise<string | undefined> {
        try {
            await this.workingFile.replace(session.fileUri, merged.xml);
            return (await this.workingFile.read(session.fileUri)).text;
        } catch (error) {
            this.failed(writeFailureText(session.fileName, asError(error)), error);
            return undefined;
        }
    }

    private failed(text: string, error: unknown): void {
        this.notifier.logError(asError(error));
        this.notifier.showError(text);
    }

    // Fresh URIs, so a comparison opened again is a new tab and never focuses a stale one.
    private async openComparison(session: MergeSession, against: MergeSide): Promise<boolean> {
        try {
            await this.openComparisonOf(session, against);
            return true;
        } catch (error) {
            this.failed(compareFailureText(session.fileName, asError(error)), error);
            return false;
        }
    }

    private async openComparisonOf(session: MergeSession, against: MergeSide): Promise<void> {
        const { text } = await this.workingFile.read(session.fileUri);
        const document = (name: MergePaneName, documentText: string) => ({
            text: documentText,
            basename: mergePaneBasename(session.fileName, name),
        });
        const uris = this.view.serve(session.fileUri, {
            current: document("current", session.stages.current),
            incoming: document("incoming", session.stages.incoming),
            result: document("result", text),
        });
        const diffSession = this.diffStore.registerResultComparison(uris[against], uris.result);
        this.comparisons.set(diffSession, { session, against, uris });
        await this.view.open(
            uris[against],
            uris.result,
            mergeResultTabLabel(session.fileName, against),
        );
    }

    // The stages are the merge view's: once it closed, its comparisons stay as they are.
    private canSwitch(comparison: ResultComparison): boolean {
        return this.sessions.of(comparison.session.fileUri) === comparison.session;
    }

    private mergeViewEnded(session: MergeSession): void {
        for (const [diffSession, comparison] of this.comparisons) {
            if (comparison.session !== session) continue;
            for (const listener of this.changedListeners) listener(diffSession);
        }
    }

    private comparisonClosed(diffSession: DiffSession): void {
        const comparison = this.comparisons.get(diffSession);
        if (!comparison) return;
        this.comparisons.delete(diffSession);
        this.view.release(comparison.uris);
    }
}

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}
