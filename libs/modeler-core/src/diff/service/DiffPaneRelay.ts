import { LanguageQuery, Query } from "@miragon/bpmn-modeler-shared";

import { NotifierPort, SettingsPort } from "../../kernel/port/hostPorts";
import { DiffPaneHandle } from "../port/DiffPaneHandle";
import { DiffPaneStore } from "./DiffPaneStore";
import { DiffSession } from "./DiffSession";

/** A session whose two panes both report ready. */
export interface ArmedDiff {
    readonly session: DiffSession;
    readonly before: DiffPaneHandle;
    readonly after: DiffPaneHandle;
}

/**
 * What every diff format does with its panes, whatever it compares: marks a
 * pane ready and tells the format once both are, relays a pane's message to
 * its partner, and keeps each pane's locale current.
 *
 * A post to a pane that is hidden or gone is dropped with an info log line: the
 * pane asks again on its next resolve.
 */
export class DiffPaneRelay {
    constructor(
        private readonly notifier: NotifierPort,
        private readonly settings: SettingsPort,
        private readonly store: DiffPaneStore,
    ) {}

    /** Marks the pane ready and sends it the locale; returns the panes once both are ready. */
    async markReady(handle: DiffPaneHandle): Promise<ArmedDiff | undefined> {
        handle.setReady();
        await this.sendLanguage(handle);

        const session = this.store.sessionOf(handle);
        if (!session || !session.isArmed()) {
            return undefined;
        }
        const before = session.before();
        const after = session.after();
        return before && after ? { session, before, after } : undefined;
    }

    /** Re-posts the current locale to every ready pane of every session. */
    rebroadcastLanguage(): void {
        for (const session of this.store.allSessions()) {
            for (const handle of session.attachedPanes()) {
                if (handle.isReady()) {
                    void this.sendLanguage(handle);
                }
            }
        }
    }

    /** Posts the query to the pane's partner, if it has one. */
    async toPartner(handle: DiffPaneHandle, query: Query, name: string): Promise<void> {
        const partner = this.store.sessionOf(handle)?.partnerOf(handle);
        if (partner) {
            await this.post(partner, query, name);
        }
    }

    async post(handle: DiffPaneHandle, query: Query, name: string): Promise<void> {
        try {
            await handle.postMessage(query);
        } catch (error) {
            this.notifier.logInfo(`${name} dropped: ${(error as Error).message}`);
        }
    }

    private sendLanguage(handle: DiffPaneHandle): Promise<void> {
        return this.post(handle, new LanguageQuery(this.settings.getLanguage()), "setLanguage");
    }
}
