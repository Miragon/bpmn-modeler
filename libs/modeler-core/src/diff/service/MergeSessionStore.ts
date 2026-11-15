import type { MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types";

import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { ResolvableStages } from "../domain/conflictReading";
import { MergePaneUris, MergeSidesView } from "../port/MergeSidesView";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffSession } from "./DiffSession";

/** One open merge view of a conflicted file: what Git said when it opened, and where its sides are served. */
export interface MergeSession {
    readonly fileUri: string;
    readonly fileName: string;
    readonly title: string;
    readonly captions: Readonly<Record<MergeSide, MergeSideCaption>>;
    readonly uris: MergePaneUris;
    readonly stages: ResolvableStages;
}

interface Entry {
    readonly session: MergeSession;
    /** One per tab that shows the merge view; a split adds one. */
    readonly diffSessions: Set<DiffSession>;
}

/**
 * The open merge views, one per working file. A merge view lives while one
 * of its diff sessions does: once the last closes (its panes closed, or its
 * pre-registered panes never arrived), the view stops serving its sides, so
 * a tab of them restored later shows that the merge view has ended.
 */
export class MergeSessionStore implements EditorSubscription {
    private readonly entries = new Map<string, Entry>();

    private readonly closing: EditorSubscription;

    constructor(
        diffStore: DiffPaneStore,
        private readonly view: Pick<MergeSidesView, "release">,
    ) {
        this.closing = diffStore.onSessionClosed((diffSession) => this.diffClosed(diffSession));
    }

    add(session: MergeSession, diffSession: DiffSession): void {
        this.entries.set(session.fileUri, { session, diffSessions: new Set([diffSession]) });
    }

    /** Adds the diff session of another tab of a live merge view. */
    join(fileUri: string, diffSession: DiffSession): void {
        this.entries.get(fileUri)?.diffSessions.add(diffSession);
    }

    of(fileUri: string): MergeSession | undefined {
        return this.entries.get(fileUri)?.session;
    }

    /** The live merge view that serves a pane under `paneUri`. */
    servedBy(paneUri: string): MergeSession | undefined {
        return [...this.entries.values()].find(
            ({ session }) => session.uris.current === paneUri || session.uris.incoming === paneUri,
        )?.session;
    }

    ofDiffSession(diffSession: DiffSession): MergeSession | undefined {
        return this.entryOf(diffSession)?.session;
    }

    diffSessionsOf(fileUri: string): readonly DiffSession[] {
        return [...(this.entries.get(fileUri)?.diffSessions ?? [])];
    }

    dispose(): void {
        this.closing.dispose();
    }

    private diffClosed(diffSession: DiffSession): void {
        const entry = this.entryOf(diffSession);
        if (!entry) return;
        entry.diffSessions.delete(diffSession);
        if (entry.diffSessions.size === 0) {
            this.entries.delete(entry.session.fileUri);
            this.view.release(entry.session.uris);
        }
    }

    private entryOf(diffSession: DiffSession): Entry | undefined {
        return [...this.entries.values()].find(({ diffSessions }) => diffSessions.has(diffSession));
    }
}
