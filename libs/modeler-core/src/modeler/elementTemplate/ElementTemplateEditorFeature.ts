import { basename } from "path";

import { TemplateEditorCommandType } from "@miragon/bpmn-modeler-shared";

import { NotifierPort, SettingsPort } from "../../kernel/domain/hostPorts";
import { EditorSessionParticipant } from "../../editorSession/domain/EditorSessionParticipant";
import {
    displayDocumentHandler,
    syncDocumentHandler,
} from "../../editorSession/infrastructure/documentMessageHandlers";
import { webviewLogHandler } from "../../editorSession/infrastructure/webviewLogMessageHandlers";
import {
    documentFlushedHandler,
    DocumentFlushService,
} from "../../editorSession/service/DocumentFlushService";
import { EditorSessionDocuments } from "../../editorSession/service/EditorSessionDocuments";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { PendingEditsFlush } from "../../editorSession/service/PendingEditsFlush";
import {
    CommandTable,
    WebviewMessageRouter,
} from "../../editorSession/service/WebviewMessageRouter";
import { DocumentRenderParticipant } from "../../editorSession/session/DocumentRenderParticipant";
import { ElementTemplateEditorService } from "./service/ElementTemplateEditorService";
import { TemplateEditorLanguageParticipant } from "./session/TemplateEditorLanguageParticipant";

export interface ElementTemplateEditorPorts {
    readonly settings: Pick<SettingsPort, "getLanguage">;
    readonly notifier: NotifierPort;
}

/**
 * The element template editor: its services, one router from a table that names
 * every command its page may post, and its session participants. Its sessions
 * live in their own store, so they never become the target of modeler commands
 * or count as open modeler editors; the store therefore brings its own flush.
 */
export class ElementTemplateEditorFeature {
    readonly store = new EditorSessionStore(() => undefined);
    readonly pendingEdits: PendingEditsFlush;
    readonly router: WebviewMessageRouter;
    readonly participants: readonly EditorSessionParticipant[];

    constructor({ settings, notifier }: ElementTemplateEditorPorts) {
        const documents = new EditorSessionDocuments(this.store);
        const service = new ElementTemplateEditorService(this.store, documents, settings, notifier);
        const flushes = new DocumentFlushService(this.store, notifier);
        this.pendingEdits = new PendingEditsFlush(this.store, flushes, notifier);
        this.pendingEdits.serve(".json", service);

        const logToHost = webviewLogHandler(notifier, (editorId) => {
            // getFilePath throws for an editor the store no longer tracks.
            try {
                return basename(documents.getFilePath(editorId));
            } catch {
                return undefined;
            }
        });
        const commands: CommandTable<TemplateEditorCommandType> = {
            GetElementTemplateFileCommand: [
                displayDocumentHandler(service, notifier, "Element template editor is ready"),
            ],
            SyncDocumentCommand: [syncDocumentHandler(service)],
            DocumentFlushedCommand: [documentFlushedHandler(flushes)],
            LogDebugCommand: [logToHost],
            LogInfoCommand: [logToHost],
            LogWarningCommand: [logToHost],
            LogErrorCommand: [logToHost],
        };
        this.router = WebviewMessageRouter.fromTable(commands);
        this.participants = [
            new DocumentRenderParticipant(service, ".json", notifier),
            new TemplateEditorLanguageParticipant(this.store, settings, notifier),
        ];
    }
}
