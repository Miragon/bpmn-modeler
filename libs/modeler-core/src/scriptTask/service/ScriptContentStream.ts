import { UpdateScriptContentQuery } from "@miragon/bpmn-modeler-shared";
import { AsyncDebounced, asyncDebounce } from "@miragon/bpmn-modeler-types";

import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { OpenScriptTab } from "../domain/OpenScriptTabs";

/** How long edits in a script tab coalesce before one streams into the webview model. */
export const SCRIPT_STREAM_DEBOUNCE_MS = 300;

type ContentSender = AsyncDebounced<(tab: OpenScriptTab, content: string) => Promise<void>>;

/**
 * Streams the edits of each open script tab into its editor's webview model.
 * A burst of typing becomes one `UpdateScriptContentQuery`, and with it one
 * export of the whole diagram, instead of one per keystroke. A tab is keyed by
 * its tab path, as in `OpenScriptTabs`.
 */
export class ScriptContentStream {
    private readonly senders = new Map<string, ContentSender>();

    /** `onHidden` hears of each editor whose hidden webview missed an edit, so its host can replay it once shown. */
    constructor(
        private readonly store: EditorSessionStore,
        private readonly logger: LoggerPort,
        private readonly onHidden?: (editorId: string) => void,
    ) {}

    push(tabPath: string, tab: OpenScriptTab, content: string): void {
        void this.senderOf(tabPath)(tab, content);
    }

    /** Drops the tab's pending edit, as a model-side change overwrote the tab. */
    cancel(tabPath: string): void {
        this.senders.get(tabPath)?.cancel();
    }

    /** Streams the tab's pending edit now; resolves once it reached the webview or failed. */
    async flush(tabPath: string): Promise<void> {
        await this.senders.get(tabPath)?.flush();
    }

    /** Drops the tab's pending edit and forgets the tab. */
    stop(tabPath: string): void {
        this.cancel(tabPath);
        this.senders.delete(tabPath);
    }

    private senderOf(tabPath: string): ContentSender {
        let sender = this.senders.get(tabPath);
        if (!sender) {
            sender = asyncDebounce(
                (tab: OpenScriptTab, content: string) => this.send(tab, content),
                SCRIPT_STREAM_DEBOUNCE_MS,
            );
            this.senders.set(tabPath, sender);
        }
        return sender;
    }

    private async send(
        { editorId, elementId, kind, listenerIndex }: OpenScriptTab,
        content: string,
    ): Promise<void> {
        try {
            const outcome = await this.store.postUnlessHidden(
                editorId,
                new UpdateScriptContentQuery(elementId, kind, listenerIndex, content),
            );
            if (outcome === "hidden") {
                this.onHidden?.(editorId);
            }
        } catch (error) {
            this.logger.logError(error as Error);
        }
    }
}
