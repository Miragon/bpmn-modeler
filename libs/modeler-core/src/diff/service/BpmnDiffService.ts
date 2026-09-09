import {
    ApplyDiffHighlightsQuery,
    BpmnFileQuery,
    LanguageQuery,
    SyncCursorQuery,
    SyncViewportQuery,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { DiffResult, computeDiff, sideView } from "@miragon/bpmn-modeler-diff";

import { BpmnDocument } from "../../shared/domain/BpmnDocument";
import { DiffPaneHandle, DiffSession, basenameOfUriString } from "../domain/DiffSession";
import { NotifierPort, SettingsPort } from "../../shared/domain/hostPorts";
import { DiffPaneStore } from "../infrastructure/DiffPaneStore";

/**
 * Drives the diff *content* for already-resolved BPMN diff panes: it answers
 * the webview's initial file request, runs `bpmn-js-differ` once both sides
 * report ready, and keeps the two panes in lockstep (viewport, cursor,
 * language).
 *
 * Stays free of `vscode` — it works through the abstract {@link DiffPaneHandle}
 * and reads session state from {@link DiffPaneStore}. Pane lifecycle (creation,
 * pairing, disposal) and every VS Code call live in `BpmnDiffController`.
 */
export class BpmnDiffService {
    /**
     * @param notifier Logging helper for parse failures and dropped posts.
     * @param vsSettings Settings reader — provides the active UI locale so
     *   each diff pane's legend and chrome render in the user's language from
     *   the moment it opens, and re-renders on setting changes.
     * @param store Session registry consulted for partner lookups and the
     *   language re-broadcast fan-out.
     */
    constructor(
        private readonly notifier: NotifierPort,
        private readonly vsSettings: SettingsPort,
        private readonly store: DiffPaneStore,
    ) {}

    /**
     * Replies to the webview's initial `GetBpmnFileCommand` with the pane's
     * XML in viewer mode.  Engine detection is best-effort — an untagged
     * diagram reports `undefined`, since viewer mode does not render
     * engine-specific extensions anyway.
     */
    async sendViewerFile(handle: DiffPaneHandle): Promise<void> {
        try {
            const content = handle.getText();
            const engine = new BpmnDocument(content).detectEngine();
            await handle.postMessage(new BpmnFileQuery(content, engine, "viewer"));
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    /**
     * Marks the pane ready, sends it the current locale, and runs the differ
     * once both panes of the session report ready.
     */
    async markReady(handle: DiffPaneHandle): Promise<void> {
        handle.setReady();
        await this.sendLanguage(handle);

        const session = this.store.findByUri(handle.uri);
        if (!session || !session.isArmed()) {
            return;
        }
        const before = session.before();
        const after = session.after();
        if (before && after) {
            await this.computeAndBroadcast(session, before, after);
        }
    }

    /**
     * Re-posts the current locale to every ready diff pane. Invoked by the
     * controller when the user changes `miragon.bpmnModeler.language`.
     */
    rebroadcastLanguage(): void {
        for (const session of this.store.allSessions()) {
            for (const handle of session.attachedPanes()) {
                if (handle.isReady()) {
                    void this.sendLanguage(handle);
                }
            }
        }
    }

    /**
     * Posts the partner's viewport change to this pane so panning/zoom stays
     * in lockstep.  Silently drops posts when the partner is hidden or gone.
     */
    async forwardViewport(
        handle: DiffPaneHandle,
        viewport: ViewportChangedCommand["viewport"],
    ): Promise<void> {
        const partner = this.partnerOf(handle);
        if (!partner) {
            return;
        }
        try {
            await partner.postMessage(new SyncViewportQuery(viewport));
        } catch (error) {
            this.notifier.logInfo(`syncViewport dropped: ${(error as Error).message}`);
        }
    }

    /**
     * Posts the partner's stepper cursor change so both panes' Next/Prev
     * navigation stays in lockstep.  Mirrors {@link forwardViewport} — same
     * partner lookup, same drop-silently-on-failure semantics.
     */
    async forwardCursor(handle: DiffPaneHandle, index: number): Promise<void> {
        const partner = this.partnerOf(handle);
        if (!partner) {
            return;
        }
        try {
            await partner.postMessage(new SyncCursorQuery(index));
        } catch (error) {
            this.notifier.logInfo(`syncCursor dropped: ${(error as Error).message}`);
        }
    }

    /**
     * Posts the current UI locale to the given pane so its legend and other
     * non-bpmn-js UI render in the user's language.  Silently drops the post
     * when the pane is hidden or already disposed — the pane will request the
     * language again on its next resolve.
     */
    private async sendLanguage(handle: DiffPaneHandle): Promise<void> {
        try {
            await handle.postMessage(new LanguageQuery(this.vsSettings.getLanguage()));
        } catch (error) {
            this.notifier.logInfo(`setLanguage dropped: ${(error as Error).message}`);
        }
    }

    private partnerOf(handle: DiffPaneHandle): DiffPaneHandle | undefined {
        const session = this.store.findByUri(handle.uri);
        return session?.partnerOf(handle);
    }

    /**
     * Delegates the computation to the shared {@link computeDiff} data layer,
     * then posts a side-targeted {@link ApplyDiffHighlightsQuery} to each
     * webview via {@link sideView}.  Each side receives only the ids present on
     * its own canvas:
     *   - removed elements exist only on `before`.
     *   - added elements exist only on `after`.
     *   - changed and layoutChanged elements exist on both.
     *
     * A `computeDiff` failure is logged and dropped — the panes simply render
     * without highlights rather than surfacing a hard error to the user.
     */
    private async computeAndBroadcast(
        session: DiffSession,
        before: DiffPaneHandle,
        after: DiffPaneHandle,
    ): Promise<void> {
        let result: DiffResult;
        try {
            result = await computeDiff(before.getText(), after.getText());
        } catch (error) {
            this.notifier.logError(error as Error);
            return;
        }

        const beforeView = sideView(result, "before");
        const afterView = sideView(result, "after");

        await this.postHighlights(
            before,
            new ApplyDiffHighlightsQuery(
                "before",
                beforeView.added,
                beforeView.removed,
                beforeView.changed,
                beforeView.layoutChanged,
                result.counts,
                result.navigationOrder,
                session.origin,
                basenameOfUriString(before.uri),
            ),
        );
        await this.postHighlights(
            after,
            new ApplyDiffHighlightsQuery(
                "after",
                afterView.added,
                afterView.removed,
                afterView.changed,
                afterView.layoutChanged,
                result.counts,
                result.navigationOrder,
                session.origin,
                basenameOfUriString(after.uri),
            ),
        );
    }

    private async postHighlights(
        handle: DiffPaneHandle,
        query: ApplyDiffHighlightsQuery,
    ): Promise<void> {
        try {
            await handle.postMessage(query);
        } catch (error) {
            this.notifier.logInfo(`ApplyDiffHighlights dropped: ${(error as Error).message}`);
        }
    }
}
