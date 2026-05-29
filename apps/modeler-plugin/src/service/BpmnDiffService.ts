// Bundler (webpack + ts-loader) does not pick up ambient module declarations
// from `src/types/*.d.ts` via tsconfig `include` alone — it honours explicit
// triple-slash references though.  `tsc --noEmit` handles both, but the
// bundler path is the one that ships the extension, so the references are
// required for the production build.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/bpmn-js-differ.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/bpmn-moddle.d.ts" />
import { diff } from "bpmn-js-differ";

import {
    ApplyDiffHighlightsQuery,
    BpmnFileQuery,
    DiffCounts,
    Engine,
    LanguageQuery,
    SyncCursorQuery,
    SyncViewportQuery,
    ViewportChangedCommand,
    buildFlowOrder,
    buildRemovedAnchors,
    sortIdsByOrder,
} from "@miragon/bpmn-modeler-shared";

import { BpmnDocument } from "../domain/BpmnDocument";
import { DiffPaneHandle, DiffSession, basenameOfUriString } from "../domain/DiffSession";
import { NotifierPort, SettingsPort } from "../domain/hostPorts";
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
     * XML in viewer mode.  Engine detection is best-effort — diagrams without
     * an execution-platform attribute fall back to `"c7"`, since viewer mode
     * does not render engine-specific extensions anyway.
     */
    async sendViewerFile(handle: DiffPaneHandle): Promise<void> {
        try {
            const content = handle.getText();
            let engine: Engine;
            try {
                engine = new BpmnDocument(content).detectPlatform();
            } catch {
                engine = "c7";
            }
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
     * Parses both panes' XML, runs `bpmn-js-differ`, and posts a side-targeted
     * {@link ApplyDiffHighlightsQuery} to each webview.  Each side receives
     * only the ids present on its own canvas:
     *   - `_removed` elements exist only on `before`.
     *   - `_added` elements exist only on `after`.
     *   - `_changed` and `_layoutChanged` elements exist on both.
     */
    private async computeAndBroadcast(
        session: DiffSession,
        before: DiffPaneHandle,
        after: DiffPaneHandle,
    ): Promise<void> {
        const beforeXml = before.getText();
        const afterXml = after.getText();

        let beforeDefs: unknown;
        let afterDefs: unknown;
        try {
            // `bpmn-moddle` has no `default` export — its ESM dist only
            // re-exports the factory as `BpmnModdle`.  Webpack's ESM→CJS
            // interop does not synthesize `.default`, so we accept both
            // shapes for forward-compat across bundler upgrades.
            const moddleMod = (await import("bpmn-moddle")) as unknown as {
                default?: () => {
                    fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
                };
                BpmnModdle?: () => {
                    fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
                };
            };
            const createBpmnModdle = moddleMod.default ?? moddleMod.BpmnModdle;
            if (typeof createBpmnModdle !== "function") {
                throw new Error(
                    "bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.",
                );
            }
            const moddle = createBpmnModdle();
            beforeDefs = (await moddle.fromXML(beforeXml)).rootElement;
            afterDefs = (await moddle.fromXML(afterXml)).rootElement;
        } catch (error) {
            this.notifier.logError(error as Error);
            return;
        }

        const result = diff(
            beforeDefs as Parameters<typeof diff>[0],
            afterDefs as Parameters<typeof diff>[1],
        );

        const added = Object.keys(result._added);
        const removed = Object.keys(result._removed);
        const changed = Object.keys(result._changed);
        const layoutChanged = Object.keys(result._layoutChanged);
        const counts: DiffCounts = {
            added: added.length,
            removed: removed.length,
            changed: changed.length,
            layoutChanged: layoutChanged.length,
        };

        // Order all id arrays by sequence-flow position so the diff stepper
        // walks from start event to end event instead of in the differ's
        // arbitrary insertion order.  Removed elements live only on the
        // before canvas; anchor each one next to a surviving neighbour in the
        // after order so it appears near where it used to be in the flow.
        const afterOrder = buildFlowOrder(afterDefs as never);
        const removedAnchors = buildRemovedAnchors(removed, beforeDefs as never, afterOrder);
        const sortedAdded = sortIdsByOrder(added, afterOrder);
        const sortedRemoved = sortIdsByOrder(removed, removedAnchors);
        const sortedChanged = sortIdsByOrder(changed, afterOrder);
        const sortedLayoutChanged = sortIdsByOrder(layoutChanged, afterOrder);

        // Merged navigation order: dedup across categories, then sort once
        // more so removed elements interleave with added/changed at their
        // anchored positions instead of sitting in their own block.
        const merged: string[] = [];
        const seen = new Set<string>();
        for (const id of [
            ...sortedAdded,
            ...sortedRemoved,
            ...sortedChanged,
            ...sortedLayoutChanged,
        ]) {
            if (!seen.has(id)) {
                seen.add(id);
                merged.push(id);
            }
        }
        const navigationOrder = sortIdsByOrder(merged, afterOrder, removedAnchors);

        await this.postHighlights(
            before,
            new ApplyDiffHighlightsQuery(
                "before",
                [],
                sortedRemoved,
                sortedChanged,
                sortedLayoutChanged,
                counts,
                navigationOrder,
                session.origin,
                basenameOfUriString(before.uri),
            ),
        );
        await this.postHighlights(
            after,
            new ApplyDiffHighlightsQuery(
                "after",
                sortedAdded,
                [],
                sortedChanged,
                sortedLayoutChanged,
                counts,
                navigationOrder,
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
