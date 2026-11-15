import { mergeRefusalOf } from "@miragon/bpmn-modeler-merge";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { readConflictMarkers } from "../../kernel/domain/conflictMarkers";
import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { NotifierPort } from "../../kernel/port/hostPorts";
import { conflictReadingOf, isMergeViewCandidate } from "../domain/conflictReading";
import { mergeTabLabel } from "../domain/diffTabLabel";
import { gitOperationOf } from "../domain/gitOperation";
import { mergePaneBasename } from "../domain/mergePaneName";
import { inPaneOrder } from "../domain/mergePaneSide";
import { mergeSideCaptions } from "../domain/mergeSideCaptions";
import { showsSameConflict } from "../domain/mergeViewContent";
import {
    mergeViewFailedText,
    MergeViewRefusal,
    mergeViewRefusal,
    StageRefusal,
} from "../domain/mergeViewTexts";
import { ConflictVersionsSource } from "../port/ConflictVersionsSource";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { MergeSideDocument, MergeSidesView } from "../port/MergeSidesView";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";
import { MergeOfStages, mergeStages } from "./mergeStages";

/** What became of a merge pane the host resolved: it shows a live merge view, or that its view ended. */
export type MergePaneAttachment = "joined" | "ended";

/**
 * Opens a conflicted file's two sides as a merge view, and decides what a
 * merge pane the host resolves shows. Reads Git through the port, decides
 * through the domain and never writes: the working file and the index stay
 * as Git left them.
 */
export class MergeViewOpener {
    // A second request for a file while the first still reads Git joins the first.
    private readonly openings = new Map<string, Promise<void>>();

    constructor(
        private readonly source: ConflictVersionsSource,
        private readonly view: MergeSidesView,
        private readonly diffStore: DiffPaneStore,
        private readonly sessions: MergeSessionStore,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Opens the merge view of `fileUri`, or focuses the open one by opening
     * its own pane URIs again while it still shows the conflict Git holds;
     * explains a file it cannot open and shows any failure, so it never rejects.
     */
    open(fileUri: string | undefined): Promise<void> {
        if (fileUri === undefined) {
            this.refuse({ kind: "noFile" }, "");
            return Promise.resolve();
        }
        const running = this.openings.get(fileUri);
        if (running) return running;
        const opening = this.openFile(fileUri)
            .catch((error: unknown) => this.fail(error))
            .finally(() => this.openings.delete(fileUri));
        this.openings.set(fileUri, opening);
        return opening;
    }

    /**
     * Attaches a resolved merge pane to its merge view. A pane already attached
     * joins nothing new, so a second resolve of it registers nothing; a pane
     * of a live view whose sessions all hold that side (a split or a second
     * tab) gets a session of its own; the stage of a merge result comparison
     * joins the comparison registered for it; any other pane belongs to a
     * view that ended, as after a window reload, and is recorded nowhere.
     */
    attachPane(handle: DiffPaneHandle): MergePaneAttachment {
        if (this.diffStore.sessionOf(handle)) return "joined";
        const session = this.sessions.servedBy(handle.uri);
        if (!session) return this.attachToComparison(handle);
        const awaiting = this.sessions
            .diffSessionsOf(session)
            .find((diffSession) => diffSession === this.diffStore.awaitingPaneFor(handle.uri));
        const diffSession = awaiting ?? this.diffStore.registerMerge(session.uris);
        if (!awaiting) this.sessions.join(session, diffSession);
        diffSession.attachPane(handle);
        this.diffStore.cancelTtl(diffSession);
        return "joined";
    }

    // A stage a merge result comparison serves belongs to no merge view, only to the comparison registered for it.
    private attachToComparison(handle: DiffPaneHandle): MergePaneAttachment {
        const comparison = this.diffStore.awaitingPaneFor(handle.uri);
        if (!comparison) return "ended";
        comparison.attachPane(handle);
        this.diffStore.cancelTtl(comparison);
        return "joined";
    }

    private async openFile(fileUri: string): Promise<void> {
        const fileName = uriDisplayName(fileUri);
        if (!isMergeViewCandidate(fileName)) {
            this.refuse({ kind: "notBpmn" }, fileName);
            return;
        }
        const facts = await this.source.readConflict(fileUri);
        const reading = conflictReadingOf(fileName, facts);
        if (reading.kind !== "resolvable") {
            this.refuse(reading, fileName);
            return;
        }
        const markers = readConflictMarkers(facts.workingText ?? "");
        const captions = mergeSideCaptions(
            gitOperationOf(facts.refs, markers),
            facts.refs,
            markers,
        );
        const title = mergeTabLabel(fileName, captions);
        const live = this.sessions.of(fileUri);
        if (live && showsSameConflict(live, { stages: reading.stages, title })) {
            await this.show(live);
            return;
        }
        const merge = await this.mergeOf(reading.stages);
        if (merge.kind === "refused") {
            this.refuse(merge.refusal, fileName);
            return;
        }
        const sideDocument = (side: MergeSide): MergeSideDocument => ({
            text: reading.stages[side],
            basename: mergePaneBasename(fileName, side),
        });
        const uris = this.view.serve(fileUri, {
            current: sideDocument("current"),
            incoming: sideDocument("incoming"),
        });
        const session: MergeSession = {
            fileUri,
            fileName,
            title,
            captions,
            uris,
            stages: reading.stages,
            decisions: merge.decisions,
            sources: merge.sources,
            navigationOrder: merge.navigationOrder,
        };
        this.sessions.add(session, this.diffStore.registerMerge(uris));
        await this.show(session);
    }

    /**
     * Merges the stages before any pane opens, so stages the merge refuses
     * open nothing. Any other failure is no refusal and rejects.
     */
    private async mergeOf(
        stages: MergeSession["stages"],
    ): Promise<
        | { readonly kind: "refused"; readonly refusal: StageRefusal }
        | ({ readonly kind: "merged" } & MergeOfStages)
    > {
        try {
            return { kind: "merged", ...(await mergeStages(stages)) };
        } catch (error) {
            const refusal = mergeRefusalOf(error);
            if (refusal === undefined) throw error;
            return { kind: "refused", refusal };
        }
    }

    private async show(session: MergeSession): Promise<void> {
        await this.view.open(...inPaneOrder(session.uris), session.title);
    }

    private fail(error: unknown): void {
        const reason = error instanceof Error ? error : new Error(String(error));
        this.notifier.logError(reason);
        this.notifier.showError(mergeViewFailedText(reason));
    }

    private refuse(refusal: MergeViewRefusal, fileName: string): void {
        this.notifier.showInfo(mergeViewRefusal(refusal, fileName));
    }
}
