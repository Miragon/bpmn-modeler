import {
    ApplyDiffHighlightsQuery,
    BpmnFileQuery,
    type MergePaneStepList,
    type MergePickScope,
    SyncCursorQuery,
    SyncDiffPlaneQuery,
    SyncDiffSelectionQuery,
    SyncViewportQuery,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { DiffResult, computeDiff, sideView } from "@miragon/bpmn-modeler-diff";
import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { DiffSession } from "./DiffSession";
import { uriDisplayName } from "../../kernel/domain/workspacePath";
import { NotifierPort, SettingsPort } from "../../kernel/port/hostPorts";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffPaneRelay } from "./DiffPaneRelay";
import { ElementXmlDiffService } from "./ElementXmlDiffService";
import { ElementXmlMergeService } from "./ElementXmlMergeService";
import { MergeBuildService } from "./MergeBuildService";
import { MergeDecisionService, type MergePickRequest } from "./MergeDecisionService";

/** A host's element XML diff: shows an element's XML from both sides and moves it with the selection. */
export type ElementXmlChanges = Pick<ElementXmlDiffService, "show" | "follow">;

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
     * @param elementXmlChanges The host's element XML diff; without it the
     *   panes do not offer an element's XML changes.
     * @param merge The merge views' decisions: a merge pane opens in merge
     *   viewer mode and gets its merge states instead of diff highlights;
     *   absent on a host that opens no merge view.
     * @param build Builds a merge view's result into the working file and
     *   compares it with either side; absent on a host that builds none.
     * @param elementXmlMerge Merges a picked element's XML by hand in the
     *   host's merge editor; absent on a host that has none.
     */
    constructor(
        private readonly notifier: NotifierPort,
        vsSettings: SettingsPort,
        private readonly store: DiffPaneStore,
        private readonly elementXmlChanges?: ElementXmlChanges,
        private readonly merge?: MergeDecisionService,
        private readonly build?: MergeBuildService,
        private readonly elementXmlMerge?: ElementXmlMergeService,
    ) {
        this.relay = new DiffPaneRelay(notifier, vsSettings, store);
        build?.onComparisonChanged((session) => void this.rebroadcast(session));
    }

    /**
     * Replies to the webview's initial `GetBpmnFileCommand` with the pane's
     * XML in viewer mode, or merge mode for a pane of a merge view, whose
     * session the host attaches before the page boots.  Engine detection is
     * best-effort — an untagged diagram reports `undefined`, since viewer mode
     * does not render engine-specific extensions anyway.
     */
    async sendViewerFile(handle: DiffPaneHandle): Promise<void> {
        try {
            const content = handle.getText();
            const engine = new BpmnDocument(content).detectEngine();
            const session = this.store.sessionOf(handle);
            const viewerMode = session && this.merge?.shows(session) ? "merge" : "viewer";
            await handle.postMessage(new BpmnFileQuery(content, engine, viewerMode));
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    /**
     * Marks the pane ready, sends it the current locale, and once both panes
     * of the session report ready runs the differ, or sends a merge view's
     * panes the full state of its decisions: on every ready, since a pane
     * that reloaded after a tab switch has lost what it showed.
     */
    async markReady(handle: DiffPaneHandle): Promise<void> {
        const armed = await this.relay.markReady(handle);
        if (!armed) return;
        if (this.merge?.shows(armed.session)) {
            await this.merge.broadcast(armed);
        } else {
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
        const session = this.store.sessionOf(handle);
        if (session && this.merge?.shows(session)) this.merge.noteCursor(session, index);
        return this.relay.toPartner(handle, new SyncCursorQuery(index), "syncCursor");
    }

    /** Whether the host opens merge views, whose panes step, pick and undo through the core. */
    get opensMergeViews(): boolean {
        return this.merge !== undefined;
    }

    /** Keeps the list a merge pane steps through and has its partner walk it too. */
    async chooseMergeStepList(handle: DiffPaneHandle, list: MergePaneStepList): Promise<void> {
        const armed = this.relay.armedOf(handle);
        if (armed && this.merge?.shows(armed.session)) {
            await this.merge.chooseStepList(armed, list);
        }
    }

    /**
     * Keeps the element from `side`, or the merge pane's side when absent, as
     * far as `scope` reaches; `dropsHandMerges` lets it drop the versions
     * merged by hand it moves off their side.
     */
    async pickMergeSide(
        handle: DiffPaneHandle,
        elementId: string,
        scope: MergePickScope,
        side?: MergeSide,
        dropsHandMerges?: boolean,
    ): Promise<void> {
        const armed = this.relay.armedOf(handle);
        if (armed && this.merge?.shows(armed.session)) {
            await this.merge.pick(armed, handle, { elementId, scope, side, dropsHandMerges });
        }
    }

    /**
     * Merge XML on an element no pick decides yet: keeps it as
     * {@link pickMergeSide} would, then opens its XML in the merge editor.
     * Picks nothing where the host has no merge editor for it.
     */
    async pickMergeSideThenMergeXml(handle: DiffPaneHandle, pick: MergePickRequest): Promise<void> {
        const armed = this.relay.armedOf(handle);
        const merge = this.merge;
        if (!armed || !merge?.shows(armed.session)) return;
        if (!this.elementXmlMerge) {
            this.notifier.logInfo(
                `Merge XML of ${pick.elementId} not opened: the host offers no XML merge editor.`,
            );
            return;
        }
        await this.elementXmlMerge.openWithPick(armed.session, pick.elementId, () =>
            merge.pick(armed, handle, pick),
        );
    }

    /** Takes the user's pick back, as far as the merge pane named for it. */
    async unpickMerge(
        handle: DiffPaneHandle,
        elementId: string,
        scope: MergePickScope,
        dropsHandMerges?: boolean,
    ): Promise<void> {
        const armed = this.relay.armedOf(handle);
        if (armed && this.merge?.shows(armed.session)) {
            await this.merge.unpick(armed, handle, { elementId, scope, dropsHandMerges });
        }
    }

    /** Whether the host has a merge editor for an element's XML, which merge panes may then offer. */
    get offersElementXmlMerge(): boolean {
        return this.elementXmlMerge !== undefined;
    }

    /** Opens the merge editor on a picked element of the merge pane's view, or brings its open one to the front. */
    async openElementXmlMerge(
        handle: DiffPaneHandle,
        elementId: string,
        resume?: boolean,
    ): Promise<void> {
        const session = this.store.sessionOf(handle);
        if (session) await this.elementXmlMerge?.open(session, elementId, resume);
    }

    /** Whether the host builds a merge view's result into its working file and compares it. */
    get buildsMergeResults(): boolean {
        return this.build !== undefined;
    }

    /** Builds the result of the merge view whose pane asked into its working file. */
    async buildMergeResult(handle: DiffPaneHandle): Promise<void> {
        const session = this.store.sessionOf(handle);
        if (session) await this.build?.build(session);
    }

    /** Opens a diff of the built result against `against`'s stage. */
    async compareMergeResult(handle: DiffPaneHandle, against: MergeSide): Promise<void> {
        const session = this.store.sessionOf(handle);
        if (session) await this.build?.compare(session, against);
    }

    /** Replaces the result comparison the pane belongs to with the one against the other side. */
    async switchMergeComparison(handle: DiffPaneHandle): Promise<void> {
        const session = this.store.sessionOf(handle);
        if (session) await this.build?.switchComparison(session);
    }

    /** Posts the plane the user entered to the partner pane, so both show the same subprocess. */
    forwardPlane(handle: DiffPaneHandle, planeId: string): Promise<void> {
        return this.relay.toPartner(handle, new SyncDiffPlaneQuery(planeId), "syncPlane");
    }

    /** Whether the panes offer an element's XML changes, because the host shows them. */
    get showsElementXmlChanges(): boolean {
        return this.elementXmlChanges !== undefined;
    }

    /** Opens the element's XML diff, or moves the open one to the element. */
    async showElementXmlChanges(handle: DiffPaneHandle, elementId: string): Promise<void> {
        await this.elementXmlChanges?.show(handle, elementId);
    }

    /** Moves an open XML diff to the element the pane selected. */
    async followSelectionWithElementXml(handle: DiffPaneHandle, elementId: string): Promise<void> {
        await this.elementXmlChanges?.follow(handle, elementId);
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

        const comparison = this.build?.comparisonOf(session);
        const highlightsFor = (side: DiffSide, pane: DiffPaneHandle) => {
            const view = sideView(result, side);
            return new ApplyDiffHighlightsQuery(
                side,
                view.added,
                view.removed,
                view.changed,
                view.layoutChanged,
                result.counts,
                result.navigationOrder,
                session.origin,
                uriDisplayName(pane.uri),
                this.showsElementXmlChanges,
                comparison,
            );
        };

        await this.postHighlights(before, highlightsFor("before", before));
        await this.postHighlights(after, highlightsFor("after", after));
    }

    private async rebroadcast(session: DiffSession): Promise<void> {
        const panes = session.armedPanes();
        if (panes) await this.computeAndBroadcast(session, panes.before, panes.after);
    }

    private postHighlights(handle: DiffPaneHandle, query: ApplyDiffHighlightsQuery): Promise<void> {
        return this.relay.post(handle, query, "ApplyDiffHighlights");
    }
}
