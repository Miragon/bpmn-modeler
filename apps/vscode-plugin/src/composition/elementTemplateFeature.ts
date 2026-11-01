import { basename } from "node:path";

import { ExtensionContext } from "vscode";

import {
    displayDocumentHandler,
    DocumentFlushService,
    documentFlushedHandler,
    DocumentRenderParticipant,
    EditorSessionDocuments,
    EditorSessionStore,
    ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
    ElementTemplateEditorService,
    PendingEditsFlush,
    registerWebviewLogHandlers,
    syncDocumentHandler,
    TemplateEditorLanguageParticipant,
    WebviewMessageRouter,
} from "@miragon/bpmn-modeler-core";
import { DocumentSaveFlushController } from "../modeler/editor-session/DocumentSaveFlushController";
import { ModelerEditorController } from "../modeler/editor-session/ModelerEditorController";
import { ElementTemplateEditorController } from "../modeler/elementTemplate/controller/ElementTemplateEditorController";
import { SharedDeps } from "./sharedDeps";

/**
 * The element template editor, the main editor for template files. Its
 * sessions live in their own store, so they never become the target of
 * modeler commands or count towards `bpmn-modeler.openCustomEditors`; the
 * store therefore brings its own save flush.
 */
export function register(context: ExtensionContext, deps: SharedDeps): void {
    const templateStore = new EditorSessionStore(() => undefined);
    context.subscriptions.push(templateStore);
    const templateDocuments = new EditorSessionDocuments(templateStore);
    const templateService = new ElementTemplateEditorService(
        templateStore,
        templateDocuments,
        deps.vsSettings,
        deps.notifier,
    );
    const flushSvc = new DocumentFlushService(templateStore, deps.notifier);
    const pendingEdits = new PendingEditsFlush(templateStore, flushSvc, deps.notifier);
    pendingEdits.serve(".json", templateService);

    const messageRouter = new WebviewMessageRouter()
        .on(
            "GetElementTemplateFileCommand",
            displayDocumentHandler(
                templateService,
                deps.notifier,
                "Element template editor is ready",
            ),
        )
        .on("SyncDocumentCommand", syncDocumentHandler(templateService))
        .on("DocumentFlushedCommand", documentFlushedHandler(flushSvc));
    registerWebviewLogHandlers(messageRouter, deps.notifier, (editorId) => {
        try {
            return basename(templateDocuments.getFilePath(editorId));
        } catch {
            return undefined;
        }
    });

    new ModelerEditorController(templateStore, deps.notifier, {
        viewType: ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
        messageRouter,
        participants: [
            new DocumentRenderParticipant(templateService, ".json", deps.notifier),
            new TemplateEditorLanguageParticipant(templateStore, deps.vsSettings, deps.notifier),
        ],
    }).register(context);
    new DocumentSaveFlushController(templateStore, pendingEdits).register(context);
    new ElementTemplateEditorController(deps.notifier, deps.vsSettings).register(context);
}
