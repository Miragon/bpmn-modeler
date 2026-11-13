import {
    createResolver,
    type DmnEditorCommand,
    type DmnFileQuery,
    type InertLock,
    LogErrorCommand,
    WebviewDocumentSync,
} from "@miragon/bpmn-modeler-shared";
import { isBlankDocument, NoModelerError } from "@miragon/bpmn-modeler-types";
import type { DmnModelerHandle } from "@miragon/dmn-modeler";

import type { DmnHost } from "../port/dmnHost";

type HostChannel = Pick<DmnHost, "postMessage">;

/** The DMN webview's document lifecycle on top of the shared {@link WebviewDocumentSync}. */
export class DmnDocumentSession {
    private attachedModeler: DmnModelerHandle | undefined;
    private initialDocumentImported = false;
    private disposed = false;
    private readonly initialHostFile = createResolver<DmnFileQuery>();

    readonly document: WebviewDocumentSync;

    readonly respondToFlush: WebviewDocumentSync["respondToFlush"];

    constructor(
        private readonly host: HostChannel,
        flushLock: InertLock,
    ) {
        this.document = new WebviewDocumentSync(host, {
            surface: {
                importDocument: async (content) => {
                    if (content !== undefined && !isBlankDocument(content)) {
                        await this.requireModeler().loadDiagram(content);
                    }
                },
                exportDocument: () => this.requireModeler().exportDiagram(),
                hasPendingInput: () => this.attachedModeler?.hasPendingInput() ?? false,
                flushPendingInput: () => this.attachedModeler?.flushPendingInput(),
            },
            flushLock,
            isReady: () => this.initialDocumentImported,
        });
        this.respondToFlush = this.document.respondToFlush;
    }

    get modeler(): DmnModelerHandle | undefined {
        return this.attachedModeler;
    }

    requireModeler(): DmnModelerHandle {
        if (!this.attachedModeler) {
            throw new NoModelerError();
        }
        return this.attachedModeler;
    }

    attachModeler(modeler: DmnModelerHandle): void {
        this.attachedModeler = modeler;
    }

    async openInitialDocument(): Promise<void> {
        const initialFile = await this.initialHostFile.wait();
        try {
            await this.document.importNow(initialFile?.content, initialFile?.documentRevision ?? 0);
        } catch (error) {
            const message = error instanceof Error ? error.message : `${error}`;
            this.post(new LogErrorCommand(`Unable to open XML ${message}`));
        }
        // receiveHostFile reports each import error; keep draining so a later
        // valid host update can still complete the initial import.
        await this.document.flushPendingImports(() => undefined);
        this.initialDocumentImported = true;
    }

    async receiveHostFile(query: DmnFileQuery): Promise<void> {
        const documentRevision = query.documentRevision ?? 0;
        switch (this.document.receive(documentRevision)) {
            case "initial":
                this.initialHostFile.done(query);
                return;
            case "update":
                try {
                    await this.document.importDebounced(query.content, documentRevision);
                } catch (error) {
                    const message = error instanceof Error ? error.message : `${error}`;
                    this.post(
                        new LogErrorCommand(
                            `Something went wrong when receiving the message ${message}`,
                        ),
                    );
                }
                return;
            case "stale":
                return;
        }
    }

    scheduleSync(): void {
        this.document.scheduleSync();
    }

    flushPendingSync(): Promise<void> {
        return this.document.flushPendingSync();
    }

    async applyLanguage(locale: string): Promise<void> {
        try {
            // The handle compares resolved locales itself, so a re-push on a
            // tab re-show is a no-op and never re-opens the view.
            await this.requireModeler().setLocale(locale);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            this.post(new LogErrorCommand(`Failed to set language: ${detail}`));
        }
    }

    focusCanvas(): void {
        this.requireModeler().focusCanvas();
    }

    dispose(): void {
        this.disposed = true;
        this.document.dispose();
        this.attachedModeler?.destroy();
        this.attachedModeler = undefined;
    }

    private post(message: DmnEditorCommand): void {
        if (!this.disposed) {
            this.host.postMessage(message);
        }
    }
}
