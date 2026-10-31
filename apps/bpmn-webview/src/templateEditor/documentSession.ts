import {
    type Command,
    createInertLock,
    type ElementTemplateFileQuery,
    type FlushDocumentQuery,
    type HostApi,
    LogErrorCommand,
    type ReleaseDocumentFlushQuery,
    WebviewDocumentSync,
} from "@miragon/bpmn-modeler-shared";

type HostChannel = Pick<HostApi<unknown, Command>, "postMessage">;

/** Where the text came from: the host's document, or an edit in this page. */
export type TextOrigin = "host" | "edit";

/**
 * The template editor's copy of the document text. The page edits it directly
 * and the shared {@link WebviewDocumentSync} reconciles it with the host:
 * host revisions win over a pending edit, and a save flushes the pending one.
 */
export class TemplateDocumentSession {
    private currentText = "";
    private imported = false;
    private readonly document: WebviewDocumentSync;

    readonly respondToFlush: (
        query: FlushDocumentQuery | ReleaseDocumentFlushQuery,
    ) => Promise<void>;

    constructor(
        private readonly host: HostChannel,
        private readonly onText: (text: string, origin: TextOrigin) => void,
    ) {
        this.document = new WebviewDocumentSync(host, {
            surface: {
                importDocument: async (content) => {
                    this.currentText = content ?? "";
                    this.onText(this.currentText, "host");
                },
                exportDocument: async () => this.currentText,
            },
            flushLock: createInertLock(document.body),
            isReady: () => this.imported,
        });
        this.respondToFlush = this.document.respondToFlush;
    }

    get text(): string {
        return this.currentText;
    }

    async receive(query: ElementTemplateFileQuery): Promise<void> {
        const revision = query.documentRevision;
        try {
            switch (this.document.receive(revision)) {
                case "initial":
                    await this.document.importNow(query.content, revision);
                    this.imported = true;
                    return;
                case "update":
                    await this.document.importDebounced(query.content, revision);
                    return;
                case "stale":
                    return;
            }
        } catch (error) {
            this.host.postMessage(
                new LogErrorCommand(`Failed to show the element template: ${String(error)}`),
            );
        }
    }

    /** Takes an edit made in this page and sends it to the host once editing pauses. */
    edit(text: string): void {
        this.currentText = text;
        this.onText(text, "edit");
        this.document.scheduleSync();
    }

    flushPendingEdit(): Promise<void> {
        return this.document.flushPendingSync();
    }

    dispose(): void {
        this.document.dispose();
    }
}
