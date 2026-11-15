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
    writeFailureText,
} from "../domain/mergeBuildTexts";
import { mergePaneBasename } from "../domain/mergePaneName";
import { otherMergeSide } from "../domain/mergePaneSide";
import { overwriteDecision } from "../domain/overwriteDecision";
import { MergePaneUris, MergeSidesView } from "../port/MergeSidesView";
import { MergeWorkingFile } from "../port/MergeWorkingFile";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffSession } from "./DiffSession";
import { MergeDecisionService } from "./MergeDecisionService";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";

/** A built merge result compared with one stage: the merge view, the stage and where both stages are served. */
interface ResultComparison {
    readonly session: MergeSession;
    readonly against: MergeSide;
    readonly uris: MergePaneUris;
}

/**
 * Builds a merge view's result into the working file and compares it with
 * either side. The working file is the trial run: a build replaces and saves
 * it, never stages it, and asks first where it would replace what the user
 * may want to keep; a build that fails writes nothing. A comparison is a
 * plain BPMN diff of a Git stage against the working file as it is open,
 * taken when it opens; switching it closes it and opens the other side's.
 */
export class MergeBuildService implements EditorSubscription {
    private readonly comparisons = new Map<DiffSession, ResultComparison>();

    private readonly closing: EditorSubscription;

    constructor(
        private readonly sessions: Pick<MergeSessionStore, "ofDiffSession" | "of">,
        private readonly decisions: Pick<MergeDecisionService, "broadcastSession">,
        private readonly workingFile: MergeWorkingFile,
        private readonly view: MergeSidesView,
        private readonly diffStore: DiffPaneStore,
        private readonly notifier: NotifierPort,
        private readonly picker: Pick<PickerPort, "confirm">,
    ) {
        this.closing = diffStore.onSessionClosed((diffSession) =>
            this.comparisonClosed(diffSession),
        );
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

    /** Closes a result comparison and opens the one against the other side. */
    async switchComparison(diffSession: DiffSession): Promise<void> {
        const comparison = this.comparisons.get(diffSession);
        if (!comparison || !this.canSwitch(comparison)) return;
        for (const pane of diffSession.attachedPanes()) pane.dispose();
        await this.openComparison(comparison.session, otherMergeSide(comparison.against));
    }

    /** The side a result comparison shows, for its panes' legend; `undefined` for any other diff. */
    comparisonOf(diffSession: DiffSession): MergeResultComparison | undefined {
        const comparison = this.comparisons.get(diffSession);
        return comparison === undefined
            ? undefined
            : { against: comparison.against, canSwitch: this.canSwitch(comparison) };
    }

    dispose(): void {
        this.closing.dispose();
    }

    private async buildSession(session: MergeSession, elementXmlChanges: boolean): Promise<void> {
        const { decisions, fileName, fileUri } = session;
        if (!decisions.canBuild) {
            this.notifier.showInfo(buildRefusalText(fileName, decisions.openConflicts.length));
            return;
        }
        const decision = overwriteDecision(
            await this.workingFile.read(fileUri),
            session.lastBuild?.xml,
            fileName,
        );
        if (decision.kind === "confirm" && !(await this.picker.confirm(decision.request))) {
            return;
        }
        const merged = await this.merged(session);
        if (!merged || !(await this.written(session, merged))) return;
        session.lastBuild = { xml: merged.xml, notes: merged.notes };
        // Before the file opens and hides the merge tab, so its panes hold the notes when shown again.
        await this.decisions.broadcastSession(session, elementXmlChanges);
        await this.notifier.openDocument(filePathOfUri(fileUri));
        this.notifier.showInfo(buildDoneNotice(fileName, merged.notes.length));
    }

    private async merged(session: MergeSession): Promise<MergedDocument | undefined> {
        try {
            return await buildMerged(session.sources, session.decisions);
        } catch (error) {
            this.failed(buildFailureText(session.fileName, asError(error)), error);
            return undefined;
        }
    }

    private async written(session: MergeSession, merged: MergedDocument): Promise<boolean> {
        try {
            await this.workingFile.replace(session.fileUri, merged.xml);
            return true;
        } catch (error) {
            this.failed(writeFailureText(session.fileName, asError(error)), error);
            return false;
        }
    }

    private failed(text: string, error: unknown): void {
        this.notifier.logError(asError(error));
        this.notifier.showError(text);
    }

    // Both stages under fresh URIs, so a comparison opened again is a new tab and never focuses a stale one.
    private async openComparison(session: MergeSession, against: MergeSide): Promise<void> {
        const stage = (side: MergeSide) => ({
            text: session.stages[side],
            basename: mergePaneBasename(session.fileName, side),
        });
        const uris = this.view.serve(session.fileUri, {
            current: stage("current"),
            incoming: stage("incoming"),
        });
        const diffSession = this.diffStore.registerResultComparison(uris[against], session.fileUri);
        this.comparisons.set(diffSession, { session, against, uris });
        await this.view.open(
            uris[against],
            session.fileUri,
            mergeResultTabLabel(session.fileName, against),
        );
    }

    // The stages are the merge view's: once it closed, its comparisons stay as they are.
    private canSwitch(comparison: ResultComparison): boolean {
        return this.sessions.of(comparison.session.fileUri) === comparison.session;
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
