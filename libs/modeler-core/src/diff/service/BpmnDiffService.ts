import {
    ApplyDiffHighlightsQuery,
    BpmnFileQuery,
    SyncCursorQuery,
    SyncDiffPlaneQuery,
    SyncDiffSelectionQuery,
    SyncViewportQuery,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { DiffResult, computeDiff, sideView } from "@miragon/bpmn-modeler-diff";

import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { DiffSession } from "./DiffSession";
import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { NotifierPort, SettingsPort } from "../../kernel/port/hostPorts";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffPaneRelay } from "./DiffPaneRelay";

/**
 * Drives the diff *content* for already-resolved BPMN diff panes: it answers
 * the webview's initial file request, runs `bpmn-js-differ` once both sides
 * report ready, and keeps the two panes in lockstep (viewport, cursor,
 * language).
 *
 * Stays free of `vscode` — it works through the abstract {@link DiffPaneHandle}
 * and reads session state from {@link DiffPaneStore}. Pane lifecycle (creation,
 * pairing, disposal) and every VS Code call live in `DiffController`.
 */
export class BpmnDiffService {
    private readonly relay: DiffPaneRelay;

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
        vsSettings: SettingsPort,
        store: DiffPaneStore,
    ) {
        this.relay = new DiffPaneRelay(notifier, vsSettings, store);
    }

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
        const armed = await this.relay.markReady(handle);
        if (armed) {
            await this.computeAndBroadcast(armed.session, armed.before, armed.after);
        }
    }

    /**
     * Re-posts the current locale to every ready diff pane. Invoked by the
     * controller when the user changes `miragon.bpmnModeler.language`.
     */
    rebroadcastLanguage(): void {
        this.relay.rebroadcastLanguage();
    }

    /**
     * Posts the partner's viewport change to this pane so panning/zoom stays
     * in lockstep.  Silently drops posts when the partner is hidden or gone.
     */
    forwardViewport(
        handle: DiffPaneHandle,
        viewport: ViewportChangedCommand["viewport"],
    ): Promise<void> {
        return this.relay.toPartner(handle, new SyncViewportQuery(viewport), "syncViewport");
    }

    /**
     * Posts the partner's stepper cursor change so both panes' Next/Prev
     * navigation stays in lockstep.  Mirrors {@link forwardViewport} — same
     * partner lookup, same drop-silently-on-failure semantics.
     */
    forwardCursor(handle: DiffPaneHandle, index: number): Promise<void> {
        return this.relay.toPartner(handle, new SyncCursorQuery(index), "syncCursor");
    }

    /** Posts the plane the user entered to the partner pane, so both show the same subprocess. */
    forwardPlane(handle: DiffPaneHandle, planeId: string): Promise<void> {
        return this.relay.toPartner(handle, new SyncDiffPlaneQuery(planeId), "syncPlane");
    }

    /** Selects the element the pane selected in its partner pane too. */
    forwardSelection(handle: DiffPaneHandle, elementId: string): Promise<void> {
        return this.relay.toPartner(
            handle,
            new SyncDiffSelectionQuery(elementId),
            "syncDiffSelection",
        );
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
                uriDisplayName(before.uri),
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
                uriDisplayName(after.uri),
            ),
        );
    }

    private postHighlights(handle: DiffPaneHandle, query: ApplyDiffHighlightsQuery): Promise<void> {
        return this.relay.post(handle, query, "ApplyDiffHighlights");
    }
}
