import {
    ApplyDmnDiffHighlightsQuery,
    DmnFileQuery,
    SyncCursorQuery,
    SyncDmnDiffScrollQuery,
    SyncDmnDiffViewQuery,
    SyncViewportQuery,
} from "@miragon/bpmn-modeler-shared";
import type { TableScroll, Viewport } from "@miragon/bpmn-modeler-types";
import { DmnDiffResult, computeDmnDiff, dmnSideView } from "@miragon/dmn-modeler-diff";

import { NotifierPort, SettingsPort } from "../../kernel/port/hostPorts";
import { basenameOfUriString } from "../domain/basenameOfUriString";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { DiffPaneRelay } from "./DiffPaneRelay";
import { DiffPaneStore } from "./DiffPaneStore";

/**
 * Drives the content of DMN diff panes: answers a pane's file request,
 * compares the two versions once both panes report ready, and keeps the panes
 * in step: DRD viewport, stepper, the opened view and the table scroll.
 *
 * A failed comparison is logged; the panes then show both versions without
 * highlights.
 */
export class DmnDiffService {
    private readonly relay: DiffPaneRelay;

    constructor(
        private readonly notifier: NotifierPort,
        settings: SettingsPort,
        store: DiffPaneStore,
    ) {
        this.relay = new DiffPaneRelay(notifier, settings, store);
    }

    async sendViewerFile(handle: DiffPaneHandle): Promise<void> {
        try {
            await handle.postMessage(new DmnFileQuery(handle.getText()));
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    async markReady(handle: DiffPaneHandle): Promise<void> {
        const armed = await this.relay.markReady(handle);
        if (!armed) {
            return;
        }
        let result: DmnDiffResult;
        try {
            result = await computeDmnDiff(armed.before.getText(), armed.after.getText());
        } catch (error) {
            this.notifier.logError(error as Error);
            return;
        }
        for (const [side, pane] of [
            ["before", armed.before],
            ["after", armed.after],
        ] as const) {
            const query = new ApplyDmnDiffHighlightsQuery(
                side,
                dmnSideView(result, side),
                armed.session.origin,
                basenameOfUriString(pane.uri),
            );
            await this.relay.post(pane, query, "ApplyDmnDiffHighlights");
        }
    }

    rebroadcastLanguage(): void {
        this.relay.rebroadcastLanguage();
    }

    forwardViewport(handle: DiffPaneHandle, viewport: Viewport): Promise<void> {
        return this.relay.toPartner(handle, new SyncViewportQuery(viewport), "syncViewport");
    }

    forwardCursor(handle: DiffPaneHandle, index: number): Promise<void> {
        return this.relay.toPartner(handle, new SyncCursorQuery(index), "syncCursor");
    }

    forwardView(handle: DiffPaneHandle, elementId: string | null): Promise<void> {
        return this.relay.toPartner(handle, new SyncDmnDiffViewQuery(elementId), "syncDmnView");
    }

    forwardScroll(handle: DiffPaneHandle, scroll: TableScroll): Promise<void> {
        return this.relay.toPartner(handle, new SyncDmnDiffScrollQuery(scroll), "syncDmnScroll");
    }
}
