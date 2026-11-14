import { elementXml } from "@miragon/bpmn-modeler-diff";

import { NotifierPort } from "../../kernel/port/hostPorts";
import { ElementXmlRequests } from "../domain/ElementXmlRequests";
import { elementXmlDiffTitle } from "../domain/elementXmlDiffTitle";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { ElementXmlDiff, ElementXmlDiffView } from "../port/ElementXmlDiffView";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffSession } from "./DiffSession";

/**
 * The XML of one element without its diagram interchange, or `undefined` when
 * the diagram has no such element. Namespaces take their prefixes from the
 * declarations in `prefixSources`.
 */
export type ElementXmlExtractor = (
    xml: string,
    elementId: string,
    prefixSources: readonly string[],
) => Promise<string | undefined>;

/**
 * Shows one element's XML from both sides of a BPMN diagram diff and moves it
 * along with the selection while it is open. It closes with its diagram diff.
 */
export class ElementXmlDiffService {
    // By session, not by its URIs: two diff tabs of the same pair are two sessions.
    private readonly diffBySession = new Map<
        DiffSession,
        { readonly key: string; readonly requests: ElementXmlRequests }
    >();

    private sessionCount = 0;

    constructor(
        private readonly store: DiffPaneStore,
        private readonly view: ElementXmlDiffView,
        private readonly notifier: NotifierPort,
        private readonly extractElementXml: ElementXmlExtractor = elementXml,
    ) {
        store.onSessionClosed((session) => void this.diagramDiffClosed(session));
    }

    /** Opens the element's XML diff, or moves the open one to the element. */
    show(pane: DiffPaneHandle, elementId: string): Promise<void> {
        return this.request(pane, elementId, true);
    }

    /** Moves an open XML diff to the element a pane selected. */
    follow(pane: DiffPaneHandle, elementId: string): Promise<void> {
        return this.request(pane, elementId, false);
    }

    /** The user closed the XML diff `diffKey`, so selections compute nothing until the next show. */
    closedByUser(diffKey: string): void {
        for (const diff of this.diffBySession.values()) {
            if (diff.key === diffKey) diff.requests.closedByUser();
        }
    }

    private async diagramDiffClosed(session: DiffSession): Promise<void> {
        const diff = this.diffBySession.get(session);
        if (!diff) return;
        diff.requests.close();
        this.diffBySession.delete(session);
        try {
            await this.view.close(diff.key);
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    private async request(pane: DiffPaneHandle, elementId: string, opens: boolean): Promise<void> {
        const session = this.store.sessionOf(pane);
        const before = session?.before();
        const after = session?.after();
        if (!session || !before || !after) return;

        const { key, requests } = this.diffOf(session);
        const request = requests.begin(elementId, opens);
        if (request === undefined) return;

        try {
            const diff = await this.elementXmlDiff(key, session, before, after, elementId);
            const outcome = requests.settle(request);
            if (outcome === "show") await this.view.show(diff);
            if (outcome === "refresh") await this.view.refresh(diff);
        } catch (error) {
            requests.abandon(request);
            this.notifier.logError(error as Error);
        }
    }

    private async elementXmlDiff(
        key: string,
        session: DiffSession,
        before: DiffPaneHandle,
        after: DiffPaneHandle,
        elementId: string,
    ): Promise<ElementXmlDiff> {
        const beforeText = before.getText();
        const afterText = after.getText();
        // Both sides share one prefix per namespace, so a renamed prefix is no change.
        const prefixSources = [beforeText, afterText];
        const [beforeXml, afterXml] = await Promise.all([
            this.extractElementXml(beforeText, elementId, prefixSources),
            this.extractElementXml(afterText, elementId, prefixSources),
        ]);
        return {
            diffKey: key,
            elementId,
            title: elementXmlDiffTitle(elementId, session.origin, before, after),
            before: beforeXml ?? "",
            after: afterXml ?? "",
        };
    }

    private diffOf(session: DiffSession): { key: string; requests: ElementXmlRequests } {
        let diff = this.diffBySession.get(session);
        if (!diff) {
            this.sessionCount += 1;
            diff = { key: `element-xml-${this.sessionCount}`, requests: new ElementXmlRequests() };
            this.diffBySession.set(session, diff);
        }
        return diff;
    }
}
