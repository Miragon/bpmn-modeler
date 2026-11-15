import type { BuildNote, MergeDecisions, MergeSources } from "@miragon/bpmn-modeler-merge";
import type { MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types";

import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { MergeViewContent } from "../domain/mergeViewContent";
import { MergePaneUris, MergeSidesView } from "../port/MergeSidesView";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffSession } from "./DiffSession";

/**
 * One open merge view of a conflicted file: what Git said when it opened,
 * where its sides are served, and the merge of them, whose decisions live as
 * long as the view.
 */
export interface MergeSession extends MergeViewContent {
    readonly fileUri: string;
    readonly fileName: string;
    readonly captions: Readonly<Record<MergeSide, MergeSideCaption>>;
    readonly uris: MergePaneUris;
    readonly decisions: MergeDecisions;
    /** Parsed once for every build of this merge. */
    readonly sources: MergeSources;
    /** Every merge element in the order the panes' steppers walk them. */
    readonly navigationOrder: readonly string[];
    /** The working file as the merge view read it when it opened, usually Git's conflict markers. */
    readonly openedWorkingText?: string;
    /** The result last built into the working file; set by each build. */
    lastBuild?: MergeBuild;
}

/** A merge result written to the working file, and what its build asks the user to review. */
export interface MergeBuild {
    readonly xml: string;
    readonly notes: readonly BuildNote[];
}

interface Entry {
    readonly session: MergeSession;
    /** One per tab that shows the merge view; a split adds one. */
    readonly diffSessions: Set<DiffSession>;
}

/**
 * The open merge views. A file opened again after its conflict changed gets
 * a newer view, which {@link of} finds, while the older tab keeps its own. A
 * merge view lives while one of its diff sessions does: once the last closes
 * (its panes closed, or its pre-registered panes never arrived), the view
 * stops serving its sides, so a tab of them restored later shows that the
 * merge view has ended.
 */
export class MergeSessionStore implements EditorSubscription {
    private readonly entries = new Set<Entry>();

    private readonly endedListeners = new Set<(session: MergeSession) => void>();

    private readonly closing: EditorSubscription;

    constructor(
        diffStore: DiffPaneStore,
        private readonly view: Pick<MergeSidesView, "release">,
    ) {
        this.closing = diffStore.onSessionClosed((diffSession) => this.diffClosed(diffSession));
    }

    add(session: MergeSession, diffSession: DiffSession): void {
        this.entries.add({ session, diffSessions: new Set([diffSession]) });
    }

    /** Adds the diff session of another tab of a live merge view. */
    join(session: MergeSession, diffSession: DiffSession): void {
        this.entryOfSession(session)?.diffSessions.add(diffSession);
    }

    /** The newest live merge view of a working file. */
    of(fileUri: string): MergeSession | undefined {
        return [...this.entries].reverse().find(({ session }) => session.fileUri === fileUri)
            ?.session;
    }

    /** The live merge view that serves a pane under `paneUri`. */
    servedBy(paneUri: string): MergeSession | undefined {
        return [...this.entries].find(
            ({ session }) => session.uris.current === paneUri || session.uris.incoming === paneUri,
        )?.session;
    }

    ofDiffSession(diffSession: DiffSession): MergeSession | undefined {
        return this.entryOf(diffSession)?.session;
    }

    /** Calls `listener` with each merge view whose last tab closed. */
    onSessionEnded(listener: (session: MergeSession) => void): EditorSubscription {
        this.endedListeners.add(listener);
        return { dispose: () => this.endedListeners.delete(listener) };
    }

    diffSessionsOf(session: MergeSession): readonly DiffSession[] {
        return [...(this.entryOfSession(session)?.diffSessions ?? [])];
    }

    dispose(): void {
        this.closing.dispose();
    }

    private diffClosed(diffSession: DiffSession): void {
        const entry = this.entryOf(diffSession);
        if (!entry) return;
        entry.diffSessions.delete(diffSession);
        if (entry.diffSessions.size === 0) {
            this.entries.delete(entry);
            this.view.release(entry.session.uris);
            for (const listener of this.endedListeners) listener(entry.session);
        }
    }

    private entryOf(diffSession: DiffSession): Entry | undefined {
        return [...this.entries].find(({ diffSessions }) => diffSessions.has(diffSession));
    }

    private entryOfSession(session: MergeSession): Entry | undefined {
        return [...this.entries].find((entry) => entry.session === session);
    }
}
