import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { readConflictMarkers } from "../../kernel/domain/conflictMarkers";
import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { NotifierPort } from "../../kernel/port/hostPorts";
import { conflictReadingOf, isMergeViewCandidate } from "../domain/conflictReading";
import { mergeTabLabel } from "../domain/diffTabLabel";
import { gitOperationOf } from "../domain/gitOperation";
import { mergePaneBasename } from "../domain/mergePaneName";
import { mergeSideCaptions } from "../domain/mergeSideCaptions";
import { mergeViewFailedText, MergeViewRefusal, mergeViewRefusal } from "../domain/mergeViewTexts";
import { ConflictVersionsSource } from "../port/ConflictVersionsSource";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { MergeSideDocument, MergeSidesView } from "../port/MergeSidesView";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeSession, MergeSessionStore } from "./MergeSessionStore";

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
     * its own pane URIs again; explains a file it cannot open.
     */
    open(fileUri: string | undefined): Promise<void> {
        if (fileUri === undefined) {
            this.refuse({ kind: "noFile" }, "");
            return Promise.resolve();
        }
        const running = this.openings.get(fileUri);
        if (running) return running;
        const opening = this.openFile(fileUri).finally(() => this.openings.delete(fileUri));
        this.openings.set(fileUri, opening);
        return opening;
    }

    /**
     * Attaches a resolved merge pane to its merge view. A pane already attached
     * joins nothing new, so a second resolve of it registers nothing; a pane
     * of a live view whose sessions all hold that side (a split or a second
     * tab) gets a session of its own; any other pane belongs to a view that
     * ended, as after a window reload, and is recorded nowhere.
     */
    attachPane(handle: DiffPaneHandle): MergePaneAttachment {
        if (this.diffStore.sessionOf(handle)) return "joined";
        const session = this.sessions.servedBy(handle.uri);
        if (!session) return "ended";
        const awaiting = this.sessions
            .diffSessionsOf(session.fileUri)
            .find((diffSession) => diffSession === this.diffStore.awaitingPaneFor(handle.uri));
        const diffSession = awaiting ?? this.diffStore.registerMerge(session.uris);
        if (!awaiting) this.sessions.join(session.fileUri, diffSession);
        diffSession.attachPane(handle);
        this.diffStore.cancelTtl(diffSession);
        return "joined";
    }

    private async openFile(fileUri: string): Promise<void> {
        const live = this.sessions.of(fileUri);
        if (live) {
            await this.show(live);
            return;
        }
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
            title: mergeTabLabel(fileName, captions),
            captions,
            uris,
            stages: reading.stages,
        };
        this.sessions.add(session, this.diffStore.registerMerge(uris));
        await this.show(session);
    }

    private async show(session: MergeSession): Promise<void> {
        try {
            await this.view.open(session.uris, session.title);
        } catch (error) {
            const reason = error instanceof Error ? error : new Error(String(error));
            this.notifier.logError(reason);
            this.notifier.showError(mergeViewFailedText(reason));
        }
    }

    private refuse(refusal: MergeViewRefusal, fileName: string): void {
        this.notifier.showInfo(mergeViewRefusal(refusal, fileName));
    }
}
