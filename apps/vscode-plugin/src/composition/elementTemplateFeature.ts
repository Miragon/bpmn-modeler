import { basename } from "node:path";

import { ExtensionContext } from "vscode";

import {
    displayDocumentHandler,
    DocumentRenderParticipant,
    EditorSessionDocuments,
    EditorSessionStore,
    ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
    ElementTemplateEditorService,
    TemplateEditorLanguageParticipant,
    registerWebviewLogHandlers,
    WebviewMessageRouter,
} from "@miragon/bpmn-modeler-core";
import { ModelerEditorController } from "../modeler/editor-session/ModelerEditorController";
import { ElementTemplateEditorController } from "../modeler/elementTemplate/controller/ElementTemplateEditorController";
import { SharedDeps } from "./sharedDeps";

/**
 * The read-only element-template preview, opened beside a template's JSON
 * editor. Its sessions live in their own store, so they never become the target
 * of modeler commands or count towards `bpmn-modeler.openCustomEditors`.
 */
export function register(context: ExtensionContext, deps: SharedDeps): void {
    const previewStore = new EditorSessionStore(() => undefined);
    context.subscriptions.push(previewStore);
    const previewDocuments = new EditorSessionDocuments(previewStore);
    const previewService = new ElementTemplateEditorService(
        previewStore,
        previewDocuments,
        deps.vsSettings,
        deps.notifier,
    );

    const messageRouter = new WebviewMessageRouter().on(
        "GetElementTemplateFileCommand",
        displayDocumentHandler(previewService, deps.notifier, "Element template preview is ready"),
    );
    registerWebviewLogHandlers(messageRouter, deps.notifier, (editorId) => {
        try {
            return basename(previewDocuments.getFilePath(editorId));
        } catch {
            return undefined;
        }
    });

    new ModelerEditorController(previewStore, deps.notifier, {
        viewType: ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE,
        messageRouter,
        participants: [
            new DocumentRenderParticipant(previewService, ".json", deps.notifier),
            new TemplateEditorLanguageParticipant(previewStore, deps.vsSettings, deps.notifier),
        ],
    }).register(context);
    new ElementTemplateEditorController(deps.notifier).register(context);
}
